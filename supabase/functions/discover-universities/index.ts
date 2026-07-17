// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { FREE_LIMITS, PAID_LIMITS, ensureUsageWindow, isPaid } from "../_shared/limits.ts";
import { firecrawlSearch, concatSearchMarkdown, truncate } from "../_shared/firecrawl.ts";

interface DiscoveredProgram {
  university_name: string;
  university_country: string;
  university_city: string;
  qs_ranking: number | null;
  website_url: string;
  program_name: string;
  degree_type: string;
  department: string;
  is_stem: boolean;
  duration_months: number | null;
  match_rationale: string;
}

function tierLabel(t: string | null | undefined) {
  if (t === "top_10") return "Top 10";
  if (t === "top_50") return "Top 50";
  if (t === "top_100") return "Top 100";
  return "No tier preference";
}
function fundingLabel(f: string | null | undefined) {
  if (f === "fully_funded") return "Fully funded only";
  if (f === "partial_ok") return "Partial funding OK";
  return "Self-funded OK";
}

function computeScore(profile: any, p: DiscoveredProgram): number {
  let score = 50;
  const targets: string[] = profile.target_countries ?? [];
  if (p.university_country && targets.map((c) => c.toLowerCase()).includes(p.university_country.toLowerCase())) {
    score += 18;
  }
  const rank = p.qs_ranking ?? 999;
  const tier = profile.target_tier ?? "no_preference";
  if (tier === "top_10") score += rank <= 10 ? 22 : rank <= 50 ? 6 : -8;
  else if (tier === "top_50") score += rank <= 50 ? 18 : rank <= 100 ? 4 : -6;
  else if (tier === "top_100") score += rank <= 100 ? 14 : rank <= 200 ? 2 : -4;
  else score += rank <= 100 ? 10 : rank <= 300 ? 4 : 0;
  if (p.is_stem) score += 4;
  const gpa = Number(profile.gpa ?? 0);
  if (gpa >= 3.7) score += 6; else if (gpa >= 3.3) score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let jobId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    jobId = body.job_id ?? null;
    if (!jobId) throw new Error("job_id is required");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Mark running
    const { data: job, error: jobErr } = await admin.from("discover_jobs")
      .update({ status: "running" }).eq("id", jobId).select().single();
    if (jobErr || !job) throw jobErr ?? new Error("job not found");
    const userId = job.user_id;

    // Load profile
    let { data: profile, error: pErr } = await admin.from("profiles").select("*").eq("id", userId).single();
    if (pErr || !profile) throw pErr ?? new Error("profile missing");

    // Enforce tier limits BEFORE spending an AI call
    profile = await ensureUsageWindow(admin, profile);
    const paid = isPaid(profile);
    const runsLimit = paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs;
    if ((profile.discover_runs_used ?? 0) >= runsLimit) {
      const code = paid ? "discover_limit_reached_paid" : "discover_limit_reached";
      const msg = paid
        ? `You've reached ${PAID_LIMITS.discover_runs} discover runs for this billing period.`
        : `You've used all ${FREE_LIMITS.discover_runs} free discover runs. Upgrade to Pro for ${PAID_LIMITS.discover_runs}/month.`;
      await admin.from("discover_jobs").update({ status: "failed", error: code, completed_at: new Date().toISOString() }).eq("id", jobId);
      return new Response(JSON.stringify({ ok: false, code, reason: "discover_limit_reached", error: msg }), {
        status: 403, headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    // Load existing entries to exclude
    const { data: existing } = await admin.from("user_entries")
      .select("university:universities(name), program:programs(name)")
      .eq("user_id", userId);
    const excluded = (existing ?? [])
      .map((e: any) => `${e.university?.name ?? "?"} — ${e.program?.name ?? "?"}`)
      .join("; ") || "(none yet)";

    const ts = (profile.test_scores ?? {}) as Record<string, string>;
    const testStr = ["GRE","GMAT","IELTS","TOEFL"].map((t) => {
      const v = ts[t.toLowerCase()];
      return v ? `${t}: ${v}` : `${t}: not taken`;
    }).join(", ");

    // Phase 1: Firecrawl live search to ground the model
    const major = profile.target_major ?? "";
    const countries = (profile.target_countries ?? []).join(", ");
    const tier = tierLabel(profile.target_tier);
    const year = new Date().getFullYear();
    const [s1, s2] = await Promise.all([
      firecrawlSearch(`${major} masters programs ${countries} ${tier} ${year}`, { limit: 5, scrape: true }),
      firecrawlSearch(`best ${major} MSc MA MBA masters ${countries} QS ranking ${year}`, { limit: 5, scrape: true }),
    ]);
    const searchContext = truncate(concatSearchMarkdown([...s1, ...s2]), 12000);

    const system = "You are a graduate admissions research assistant specializing in master's degree programs. You only recommend master's level programs — MSc, MA, MEng, MBA, MPA, MPH, MS, MEd, LLM, or equivalent. Never recommend PhD, doctoral, or bachelor's programs. Only include programs confirmed in the live search context provided — do not invent programs not mentioned in the context.";

    const user = `Based on the following live search results, identify exactly 5 master's programs that best match this student profile. Only use programs found in the search results. Exclude programs already shown to this user.

Student profile:
- Target degree: Master's only
- Target major / field: ${major || "unspecified"}
- Target countries: ${countries || "any"}
- University tier preference: ${tier}
- Funding preference: ${fundingLabel(profile.funding_preference)}
- Budget ceiling: ${profile.budget_ceiling ?? "unspecified"} ${profile.budget_currency ?? ""}
- Current GPA: ${profile.gpa ?? "unspecified"}
- Test scores: ${testStr}
- Work experience: ${profile.work_exp_years ?? 0} years
- Target intake: ${profile.target_intake ?? "unspecified"}

Already shown (exclude): ${excluded}

Live search context:
${searchContext || "(no live search results available — do your best based on general knowledge, but prefer nulls over guesses)"}

Return ONLY a JSON array, no other text, no markdown fences:
[{
  "university_name": string,
  "university_country": string,
  "university_city": string,
  "qs_ranking": number or null,
  "website_url": string,
  "program_name": string,
  "degree_type": string,
  "department": string,
  "is_stem": boolean,
  "duration_months": number or null,
  "match_rationale": string (2-3 sentences referencing the student's actual preferences)
}]`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 16000 });
    let parsed: DiscoveredProgram[];
    try {
      parsed = parseJsonLoose(raw);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

    const enrichTargets: Array<{ program_id: string; university_name: string; program_name: string; website_url: string }> = [];
    for (const p of parsed.slice(0, 5)) {
      // Upsert university (by case-insensitive name + country)
      const { data: existingUni } = await admin.from("universities")
        .select("*").ilike("name", p.university_name).ilike("country", p.university_country ?? "").maybeSingle();
      let uniId = existingUni?.id;
      if (!uniId) {
        const { data: newUni, error: uErr } = await admin.from("universities").insert({
          name: p.university_name,
          country: p.university_country,
          city: p.university_city,
          qs_ranking: p.qs_ranking,
          website_url: p.website_url,
        }).select().single();
        if (uErr) { console.error("uni insert", uErr); continue; }
        uniId = newUni.id;
      }

      const { data: existingProg } = await admin.from("programs")
        .select("*").eq("university_id", uniId).ilike("name", p.program_name).maybeSingle();
      let progId = existingProg?.id;
      if (!progId) {
        const { data: newProg, error: pErr2 } = await admin.from("programs").insert({
          university_id: uniId,
          name: p.program_name,
          degree_level: "masters",
          degree_type: p.degree_type ?? null,
          duration_months: p.duration_months ?? null,
          department: p.department,
          is_stem: p.is_stem,
        }).select().single();
        if (pErr2) { console.error("prog insert", pErr2); continue; }
        progId = newProg.id;
      }

      const score = computeScore(profile, p);
      const { error: eErr } = await admin.from("user_entries").insert({
        user_id: userId,
        university_id: uniId,
        program_id: progId,
        status: "scored",
        source: "scored",
        score,
        match_rationale: p.match_rationale,
      });
      if (eErr && !eErr.message.includes("duplicate")) console.error("entry insert", eErr);
      if (progId) {
        enrichTargets.push({
          program_id: progId,
          university_name: p.university_name,
          program_name: p.program_name,
          website_url: p.website_url,
        });
      }
    }

    await admin.from("discover_jobs").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", jobId);
    // Always increment discover_runs_used (both tiers are metered)
    await admin.from("profiles").update({ discover_runs_used: (profile.discover_runs_used ?? 0) + 1 }).eq("id", userId);

    // Fire-and-forget background enrichment for all discovered programs.
    const enrichUrl = `${supabaseUrl}/functions/v1/enrich-university`;
    const authHeader = req.headers.get("Authorization") ?? `Bearer ${serviceKey}`;
    for (const t of enrichTargets) {
      fetch(enrichUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(t),
      }).catch((err) => console.error("bg enrich failed", t.program_id, err));
    }

    return new Response(JSON.stringify({ ok: true, count: parsed.length }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("discover-universities error", e);
    if (jobId) {
      const msg = (e as Error).message ?? "Unknown error";
      const friendly = /truncated|malformed/i.test(msg)
        ? "AI response was too long — please retry."
        : /401|invalid x-api-key|anthropic/i.test(msg)
          ? "AI research failed — please retry."
          : msg;
      await admin.from("discover_jobs").update({ status: "failed", error: friendly, completed_at: new Date().toISOString() }).eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});