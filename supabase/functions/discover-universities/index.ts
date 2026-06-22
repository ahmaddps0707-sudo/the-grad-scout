// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, stripFences } from "../_shared/lovable-ai.ts";

interface DiscoveredProgram {
  university_name: string;
  university_country: string;
  university_city: string;
  qs_ranking: number | null;
  website_url: string;
  program_name: string;
  degree_level: string;
  department: string;
  is_stem: boolean;
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
    const { data: profile, error: pErr } = await admin.from("profiles").select("*").eq("id", userId).single();
    if (pErr || !profile) throw pErr ?? new Error("profile missing");

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

    const system = "You are a graduate admissions research assistant. Given a student's profile, identify real, currently-operating master's degree programs that are strong matches. Only include programs you are highly confident actually exist at the named university — when uncertain, choose a more well-known program instead of guessing. Exclude any university_name + program_name pairs given in the excluded list. Respond with ONLY a JSON array, no commentary, no markdown fences.";

    const user = `Student profile: target major ${profile.target_major ?? "unspecified"}, target countries ${(profile.target_countries ?? []).join(", ") || "any"}, degree level masters, tier preference ${tierLabel(profile.target_tier)}, funding preference ${fundingLabel(profile.funding_preference)}, budget ${profile.budget_ceiling ?? "unspecified"} ${profile.budget_currency ?? ""}, GPA ${profile.gpa ?? "unspecified"}, test scores ${testStr}, work experience ${profile.work_exp_years ?? 0} years, target intake ${profile.target_intake ?? "unspecified"}.

Already shown: ${excluded}.

Return exactly 5 new programs that best match this profile. Respond with ONLY a JSON array, no other text, no markdown fences, in exactly this shape:

[{
  "university_name": string, "university_country": string,
  "university_city": string, "qs_ranking": number or null,
  "website_url": string, "program_name": string,
  "degree_level": string, "department": string, "is_stem": boolean,
  "match_rationale": string
}]`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 4096 });
    let parsed: DiscoveredProgram[];
    try {
      parsed = JSON.parse(stripFences(raw));
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

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
          degree_level: p.degree_level ?? "masters",
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
    }

    await admin.from("discover_jobs").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", jobId);
    return new Response(JSON.stringify({ ok: true, count: parsed.length }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("discover-universities error", e);
    if (jobId) {
      await admin.from("discover_jobs").update({ status: "failed", error: (e as Error).message, completed_at: new Date().toISOString() }).eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});