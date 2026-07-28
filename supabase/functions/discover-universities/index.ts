// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { FREE_LIMITS, PAID_LIMITS, ensureUsageWindow, isPaid, envColumns, envView, parseEnv } from "../_shared/limits.ts";
import { concatSnippets, firecrawlSearch, FirecrawlProviderError, normalizeUrl } from "../_shared/firecrawl.ts";

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

interface ResolvedProgram extends DiscoveredProgram {
  program_url: string | null;
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function tokenize(s: string): string[] {
  const stop = new Set([
    "and",
    "of",
    "the",
    "in",
    "for",
    "a",
    "an",
    "to",
    "science",
    "sciences",
    "studies",
    "study",
    "program",
    "programs",
    "master",
    "masters",
    "ms",
    "msc",
    "ma",
    "degree",
    "school",
    "university",
  ]);
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
}

async function resolveProgramUrl(p: DiscoveredProgram): Promise<string | null> {
  const originalDomain = extractDomain(p.website_url);
  const query = `${p.university_name} ${p.program_name} ${p.degree_type ?? ""} official program page admissions`.trim();
  const results = await firecrawlSearch(query, { limit: 3 });
  const normalized = results.map((r) => ({ ...r, url: normalizeUrl(r.url) })).filter((r) => !!r.url);
  const sameDomain = originalDomain
    ? normalized.filter((r) => {
        const d = extractDomain(r.url);
        return d && (d === originalDomain || d.endsWith("." + originalDomain) || originalDomain.endsWith("." + d));
      })
    : normalized;
  const nameTokens = tokenize(`${p.program_name} ${p.department ?? ""}`);
  // 1. Same-domain URL containing program name tokens
  const byName = sameDomain.find((r) => {
    const lower = r.url.toLowerCase();
    return nameTokens.some((t) => lower.includes(t));
  });
  if (byName) return byName.url;
  // 2. Same-domain URL containing admission/program keywords
  const kwRe = /(program|programs|degree|admission|admissions|graduate|apply|application)/i;
  const byKw = sameDomain.find((r) => kwRe.test(r.url));
  if (byKw) return byKw.url;
  // 3. First same-domain URL
  if (sameDomain[0]) return sameDomain[0].url;
  // 4. Fallback to original
  return p.website_url ?? null;
}

function tierLabel(t: string | null | undefined) {
  if (t === "top_50") return "Top 50";
  if (t === "top_100") return "Top 100";
  if (t === "top_200") return "Top 200";
  if (t === "rank_201_500") return "201-500";
  if (t === "rank_500_plus") return "500+";
  return "No tier preference";
}
function fundingLabel(f: string | null | undefined) {
  if (f === "fully_funded") return "Fully funded only";
  if (f === "partial_ok") return "Partial funding OK";
  return "Self-funded OK";
}

function computeScore(profile: any, p: DiscoveredProgram): number {
  let score = 50;
  const target: string = (profile.target_country ?? "").toLowerCase().trim();
  if (p.university_country && target && p.university_country.toLowerCase().trim() === target) {
    score += 18;
  }
  const rank = p.qs_ranking ?? 999;
  const tier = profile.target_tier ?? null;
  if (tier === "top_50") score += rank <= 50 ? 18 : rank <= 100 ? 4 : -6;
  else if (tier === "top_100") score += rank <= 100 ? 14 : rank <= 200 ? 2 : -4;
  else if (tier === "top_200") score += rank <= 200 ? 12 : rank <= 500 ? 2 : -4;
  else if (tier === "rank_201_500") score += rank >= 201 && rank <= 500 ? 12 : 0;
  else if (tier === "rank_500_plus") score += rank > 500 ? 10 : 0;
  else score += rank <= 100 ? 10 : rank <= 300 ? 4 : 0;
  if (p.is_stem) score += 4;
  const gpa = Number(profile.gpa ?? 0);
  if (gpa >= 3.7) score += 6;
  else if (gpa >= 3.3) score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isUsefulProgramResult(url: string): boolean {
  return !/linkedin\.com|facebook\.com|instagram\.com|youtube\.com|reddit\.com|quora\.com|wikipedia\.org/i.test(url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let jobId: string | null = null;
  let providerErrorCode: "search_provider_out_of_credits" | "search_provider_error" | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    jobId = body.job_id ?? null;
    const env = parseEnv(body.environment);
    if (!jobId) throw new Error("job_id is required");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Mark running
    const { data: job, error: jobErr } = await admin
      .from("discover_jobs")
      .update({ status: "running" })
      .eq("id", jobId)
      .select()
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new Error(`Discover job ${jobId} not found`);
    const userId = job.user_id;

    // Load profile
    let { data: profile, error: pErr } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (pErr) throw pErr;
    if (!profile) throw new Error("Please complete onboarding before running discovery.");

    // Enforce tier limits BEFORE spending an AI call
    profile = await ensureUsageWindow(admin, profile, env);
    const paid = isPaid(profile, env);
    const cols = envColumns(env);
    const view = envView(profile, env);
    const runsLimit = paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs;
    if (view.discoverUsed >= runsLimit) {
      const code = paid ? "discover_limit_reached_paid" : "discover_limit_reached";
      const msg = paid
        ? `You've reached ${PAID_LIMITS.discover_runs} discover runs for this billing period.`
        : `You've used all ${FREE_LIMITS.discover_runs} free discover runs. Upgrade to Pro for ${PAID_LIMITS.discover_runs}/month.`;
      await admin
        .from("discover_jobs")
        .update({ status: "failed", error: code, completed_at: new Date().toISOString() })
        .eq("id", jobId);
      return new Response(JSON.stringify({ ok: false, code, reason: "discover_limit_reached", error: msg }), {
        status: 403,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    // Load existing entries to exclude
    const { data: existing } = await admin
      .from("user_entries")
      .select("university:universities(name), program:programs(name)")
      .eq("user_id", userId);
    const excluded =
      (existing ?? []).map((e: any) => `${e.university?.name ?? "?"} — ${e.program?.name ?? "?"}`).join("; ") ||
      "(none yet)";

    const ts = (profile.test_scores ?? {}) as Record<string, string>;
    const testStr = ["GRE", "GMAT", "IELTS", "TOEFL"]
      .map((t) => {
        const v = ts[t.toLowerCase()];
        return v ? `${t}: ${v}` : `${t}: not taken`;
      })
      .join(", ");

    const major = profile.target_major ?? "graduate";
    const targetCountry: string = (profile.target_country ?? "").trim();

    const COUNTRY_SITE_FILTERS: Record<string, string[]> = {
      "united states": ["site:.edu"],
      usa: ["site:.edu"],
      us: ["site:.edu"],
      "united kingdom": ["site:.ac.uk"],
      uk: ["site:.ac.uk"],
      england: ["site:.ac.uk"],
      scotland: ["site:.ac.uk"],
      australia: ["site:.edu.au"],
      canada: ["site:.ca"],
      germany: ["site:.de"],
      netherlands: ["site:.nl"],
      france: ["site:.fr"],
      singapore: ["site:.edu.sg"],
      ireland: ["site:.ie"],
      "hong kong": ["site:.edu.hk"],
      switzerland: ["site:.ch"],
      sweden: ["site:.se"],
      italy: ["site:.it"],
      spain: ["site:.es"],
      "new zealand": ["site:.ac.nz"],
    };

    const searchQueries: string[] = [];
    if (!targetCountry) {
      searchQueries.push(`master's ${major} program admissions tuition official`);
    } else {
      const filters = COUNTRY_SITE_FILTERS[targetCountry.toLowerCase()] ?? [];
      searchQueries.push(`master's ${major} "${targetCountry}" admissions tuition official`);
      for (const f of filters) {
        searchQueries.push(`${f} master's ${major} program admissions tuition`);
      }
    }
    let searchBatches: Awaited<ReturnType<typeof firecrawlSearch>>[];
    try {
      searchBatches = await Promise.all(searchQueries.map((query) => firecrawlSearch(query, { limit: 8 })));
    } catch (e) {
      if (e instanceof FirecrawlProviderError) {
        providerErrorCode = e.code;
        throw e;
      }
      throw e;
    }
    const seenUrls = new Set<string>();
    const liveResults = searchBatches
      .flat()
      .filter((result) => result.url && isUsefulProgramResult(result.url))
      .map((result) => ({ ...result, url: normalizeUrl(result.url) }))
      .filter((result) => {
        if (seenUrls.has(result.url)) return false;
        seenUrls.add(result.url);
        return true;
      })
      .slice(0, 24);
    const liveContext = concatSnippets(liveResults);

    const system =
      "You are a graduate admissions research assistant specializing in master's degree programs. Use only the live web search results provided by the user as evidence. You only recommend master's level programs — never PhD, doctoral, or bachelor's programs. If a program is not present in the live search results with an official-looking program URL, exclude it entirely rather than guessing.";

    const user = `Student profile:
- Target degree: Master's only
- Target major / field: ${profile.target_major ?? "unspecified"}
- Target country: ${profile.target_country ?? "any"}
- University tier preference: ${tierLabel(profile.target_tier)}
- Funding preference: ${fundingLabel(profile.funding_preference)}
- Current GPA: ${profile.gpa ?? "unspecified"}
- Test scores: ${testStr}
- Work experience: ${profile.work_exp_years ?? 0} years
- Target intake: ${profile.target_intake ?? "unspecified"}

Already shown to this user (exclude these): ${excluded}.

Live web search results to use as evidence:
${liveContext || "(No live search results were available. Return an empty array.)"}

Find up to 5 master's programs that best match this profile. Every result must be a master's degree — not a PhD, not a bachelor's. Only include programs that appear in the live web search results above. Use the official program or university URL from those results as website_url.

HARD FILTER — Do NOT include any program whose university is located outside this country: ${targetCountry || "any"}. Do NOT include programs whose name/department is unrelated to "${major}". Discard rather than guess.

Respond with ONLY a JSON array, no other text, no markdown fences:
[{
  "university_name": string,
  "university_country": string,
  "university_city": string,
  "qs_ranking": number or null,
  "website_url": string — the university homepage or best available URL from the search results. Do not guess or construct URLs. Only use URLs that appear explicitly in the search context provided. If no URL is visible in the context, return null.,
  "program_name": string,
  "degree_type": string,
  "department": string,
  "is_stem": boolean,
  "duration_months": number or null,
  "match_rationale": string
}]`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 12000 });
    let parsed: DiscoveredProgram[];
    try {
      parsed = parseJsonLoose(raw);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

    const liveUrls = new Set(liveResults.map((result) => result.url));
    const targetCountryLc = targetCountry.toLowerCase();
    const targetMajorLc = (profile.target_major ?? "").toLowerCase().trim();
    const stop = new Set([
      "and",
      "of",
      "the",
      "in",
      "for",
      "a",
      "an",
      "to",
      "science",
      "sciences",
      "studies",
      "study",
      "program",
      "master",
      "masters",
      "ms",
      "msc",
      "ma",
      "degree",
    ]);
    const majorTokens = targetMajorLc.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !stop.has(t));

    function matchesTargetCountry(country: string | null | undefined): boolean {
      if (!targetCountryLc) return true; // user has no preference
      if (!country) return false;
      const c = country.toLowerCase().trim();
      return c === targetCountryLc || c.includes(targetCountryLc) || targetCountryLc.includes(c);
    }
    function matchesTargetMajor(programName: string, department: string | null | undefined): boolean {
      if (!majorTokens.length) return true; // no target major specified
      const hay = `${programName ?? ""} ${department ?? ""}`.toLowerCase();
      return majorTokens.some((tok) => hay.includes(tok));
    }

    const validatedPrograms = parsed
      .filter((p) => p?.university_name && p?.program_name && p?.website_url)
      .map((p) => ({ ...p, website_url: normalizeUrl(p.website_url) }))
      .filter((p) => liveUrls.has(p.website_url))
      .filter((p) => {
        const okCountry = matchesTargetCountry(p.university_country);
        const okMajor = matchesTargetMajor(p.program_name, p.department);
        if (!okCountry || !okMajor) {
          console.log("discard program (country/major mismatch)", {
            program: p.program_name,
            country: p.university_country,
            okCountry,
            okMajor,
          });
          return false;
        }
        return true;
      })
      .slice(0, 5);

    // Resolve specific program page URL for each result via Firecrawl.
    const resolvedPrograms: ResolvedProgram[] = await Promise.all(
      validatedPrograms.map(async (p) => {
        try {
          const program_url = await resolveProgramUrl(p);
          return { ...p, program_url };
        } catch (e) {
          console.error("resolveProgramUrl error", p.program_name, e);
          return { ...p, program_url: p.website_url ?? null };
        }
      }),
    );

    for (const p of resolvedPrograms) {
      // Upsert university (by case-insensitive name + country)
      const { data: existingUni } = await admin
        .from("universities")
        .select("*")
        .ilike("name", p.university_name)
        .ilike("country", p.university_country ?? "")
        .maybeSingle();
      let uniId = existingUni?.id;
      if (!uniId) {
        const { data: newUni, error: uErr } = await admin
          .from("universities")
          .insert({
            name: p.university_name,
            country: p.university_country,
            city: p.university_city,
            qs_ranking: p.qs_ranking,
            website_url: p.website_url,
          })
          .select()
          .single();
        if (uErr) {
          console.error("uni insert", uErr);
          continue;
        }
        uniId = newUni.id;
      }

      const { data: existingProg } = await admin
        .from("programs")
        .select("*")
        .eq("university_id", uniId)
        .ilike("name", p.program_name)
        .maybeSingle();
      let progId = existingProg?.id;
      if (!progId) {
        const { data: newProg, error: pErr2 } = await admin
          .from("programs")
          .insert({
            university_id: uniId,
            name: p.program_name,
            degree_level: "masters",
            degree_type: p.degree_type ?? null,
            duration_months: p.duration_months ?? null,
            department: p.department,
            is_stem: p.is_stem,
            program_url: p.program_url ?? null,
          })
          .select()
          .single();
        if (pErr2) {
          console.error("prog insert", pErr2);
          continue;
        }
        progId = newProg.id;
      } else if (!existingProg?.program_url && p.program_url) {
        await admin.from("programs").update({ program_url: p.program_url }).eq("id", progId);
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

    const doneUpdate: Record<string, unknown> = { status: "done", completed_at: new Date().toISOString() };
    if (validatedPrograms.length === 0) doneUpdate.error = "no_matches_for_targets";
    await admin.from("discover_jobs").update(doneUpdate).eq("id", jobId);
    // Always increment env-scoped discover_runs_used (both tiers are metered)
    await admin
      .from("profiles")
      .update({ [cols.discoverUsed]: view.discoverUsed + 1 })
      .eq("id", userId);
    return new Response(JSON.stringify({ ok: true, count: validatedPrograms.length }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("discover-universities error", e);
    if (jobId) {
      const msg = (e as Error).message ?? "Unknown error";
      const friendly = providerErrorCode
        ? providerErrorCode
        : /truncated|malformed/i.test(msg)
        ? "AI response was too long — please retry."
        : /401|invalid x-api-key|anthropic/i.test(msg)
          ? "AI research failed — please retry."
          : msg;
      await admin
        .from("discover_jobs")
        .update({ status: "failed", error: friendly, completed_at: new Date().toISOString() })
        .eq("id", jobId);
    }
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});
