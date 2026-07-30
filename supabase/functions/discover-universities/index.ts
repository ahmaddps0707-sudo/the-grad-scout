// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import {
  FREE_LIMITS,
  PAID_LIMITS,
  ensureUsageWindow,
  isPaid,
  envColumns,
  envView,
  parseEnv,
} from "../_shared/limits.ts";
import { concatSnippets, firecrawlSearch, FirecrawlProviderError, normalizeUrl } from "../_shared/firecrawl.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QsRankingRow {
  id: string;
  rank_display: string; // e.g. "1" or "951-1000"
  rank_value: number; // parsed lower bound, used for all filtering/math
  name: string; // exact QS name — source of truth for university.name
  country: string; // exact QS country — source of truth for university.country
}

// What the AI is asked to extract for ONE specific candidate university.
// Note: university identity fields (name/country/rank) are NOT requested from the AI —
// they come from qs_rankings, which is authoritative. The AI's only job is to confirm
// a relevant master's program exists and extract program-level facts about it.
interface ExtractedProgram {
  program_name: string;
  degree_type: string;
  department: string;
  is_stem: boolean;
  duration_months: number | null;
  university_city: string | null; // best-effort from snippets; qs_rankings has no city column
  match_rationale: string;
  website_url: string; // must match a URL that appeared in the live search snippets
}

interface CandidateResult extends ExtractedProgram {
  university_name: string;
  university_country: string;
  qs_ranking: number; // parsed integer, from qs_rankings.rank_value
  qs_ranking_band: string; // display text, from qs_rankings.rank_display
  program_url: string | null;
}

// ---------------------------------------------------------------------------
// Tier -> search window (base range widened by tolerance, both ends)
// ---------------------------------------------------------------------------

const TIER_WINDOWS: Record<string, { min: number; max: number }> = {
  top_50: { min: 1, max: 75 },
  top_100: { min: 1, max: 125 },
  top_200: { min: 1, max: 250 },
  rank_201_500: { min: 151, max: 550 },
  rank_500_plus: { min: 450, max: 1500 },
};

const CANDIDATE_SAMPLE_SIZE = 8;
const FINAL_RESULT_CAP = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function matchesTargetMajor(
  programName: string,
  department: string | null | undefined,
  majorTokens: string[],
): boolean {
  if (!majorTokens.length) return true;
  const hay = `${programName ?? ""} ${department ?? ""}`.toLowerCase();
  return majorTokens.some((tok) => hay.includes(tok));
}

function isUsefulProgramResult(url: string): boolean {
  return !/linkedin\.com|facebook\.com|instagram\.com|youtube\.com|reddit\.com|quora\.com|wikipedia\.org/i.test(url);
}

function parseNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fundingLabel(f: string | null | undefined) {
  if (f === "fully_funded") return "Fully funded only";
  if (f === "partial_ok") return "Partial funding OK";
  return "Self-funded OK";
}

function tierLabel(t: string | null | undefined) {
  if (t === "top_50") return "Top 50";
  if (t === "top_100") return "Top 100";
  if (t === "top_200") return "Top 200";
  if (t === "rank_201_500") return "201-500";
  if (t === "rank_500_plus") return "500+";
  return "Unspecified";
}

// Final locked scoring formula. No ranking, no country bonus (both are now
// hard-enforced upstream via qs_rankings selection, so they'd be inert here).
// Max possible: 99. Min possible: 54.
function computeScore(profile: any, program: { is_stem: boolean }): number {
  let score = 50;

  if (program.is_stem) score += 4;

  const gpa = parseNumberOrNull(profile.gpa);
  if (gpa === null) score += 10;
  else if (gpa >= 3.7) score += 20;
  else if (gpa >= 3.5) score += 15;
  else if (gpa >= 3.3) score += 10;
  else if (gpa >= 3.0) score += 5;
  else score += 2;

  const ts = (profile.test_scores ?? {}) as Record<string, string>;
  const gre = parseNumberOrNull(ts.gre);
  if (gre === null) score += 20;
  else if (gre >= 325) score += 25;
  else if (gre >= 320) score += 20;
  else if (gre >= 315) score += 15;
  else if (gre >= 310) score += 10;
  else if (gre >= 305) score += 5;
  else score += 2;

  return score;
}

// Same URL-resolution strategy as before — finds the most specific official
// program page, given a starting website_url and program identity.
async function resolveProgramUrl(p: {
  university_name: string;
  program_name: string;
  degree_type: string;
  website_url: string;
}): Promise<string | null> {
  const originalDomain = (() => {
    try {
      return new URL(p.website_url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const query = `${p.university_name} ${p.program_name} ${p.degree_type ?? ""} official program page admissions`.trim();
  const results = await firecrawlSearch(query, { limit: 3 });
  const normalized = results.map((r) => ({ ...r, url: normalizeUrl(r.url) })).filter((r) => !!r.url);
  const sameDomain = originalDomain
    ? normalized.filter((r) => {
        const d = (() => {
          try {
            return new URL(r.url).hostname.toLowerCase().replace(/^www\./, "");
          } catch {
            return null;
          }
        })();
        return d && (d === originalDomain || d.endsWith("." + originalDomain) || originalDomain.endsWith("." + d));
      })
    : normalized;
  const nameTokens = tokenize(`${p.program_name}`);
  const byName = sameDomain.find((r) => {
    const lower = r.url.toLowerCase();
    return nameTokens.some((t) => lower.includes(t));
  });
  if (byName) return byName.url;
  const kwRe = /(program|programs|degree|admission|admissions|graduate|apply|application)/i;
  const byKw = sameDomain.find((r) => kwRe.test(r.url));
  if (byKw) return byKw.url;
  if (sameDomain[0]) return sameDomain[0].url;
  return p.website_url ?? null;
}

// Per-candidate: search for this ONE university's program, ask the AI to
// confirm + extract (not discover/judge — just extract), validate against
// the live snippets (anti-hallucination) and the major filter.
async function discoverForCandidate(
  candidate: QsRankingRow,
  profile: any,
  major: string,
  apiKey: string,
  majorTokens: string[],
): Promise<CandidateResult | null> {
  const query = `${candidate.name} ${major} master's degree program official admissions`.trim();
  let results: Awaited<ReturnType<typeof firecrawlSearch>>;
  try {
    results = await firecrawlSearch(query, { limit: 6 });
  } catch (e) {
    if (e instanceof FirecrawlProviderError) throw e; // propagate provider-level failures (credits/outage)
    console.error("firecrawl error for candidate", candidate.name, e);
    return null;
  }

  const liveResults = results
    .filter((r) => r.url && isUsefulProgramResult(r.url))
    .map((r) => ({ ...r, url: normalizeUrl(r.url) }))
    .filter((r) => !!r.url);
  if (liveResults.length === 0) return null;

  const liveUrls = new Set(liveResults.map((r) => r.url));
  const liveContext = concatSnippets(liveResults);

  const system =
    "You are a graduate admissions research assistant. You are given live web search snippets " +
    "about ONE specific university. Determine whether it offers a master's degree program relevant " +
    "to the requested field. Use only the provided snippets as evidence — never use prior knowledge " +
    "and never guess a URL that is not present in the snippets. Only master's programs qualify — never " +
    "PhD, doctoral, or bachelor's programs. If no relevant master's program is found in the snippets, " +
    "respond with exactly the text: null";

  const user = `University: ${candidate.name}
Country: ${candidate.country}
Target major / field: ${major}
University tier preference: ${tierLabel(profile.target_tier)}
Funding preference: ${fundingLabel(profile.funding_preference)}

Live web search snippets for this university:
${liveContext}

If this university has a master's program relevant to "${major}" that appears in the snippets above,
respond with ONLY a JSON object, no markdown fences, no other text:
{
  "program_name": string,
  "degree_type": string,
  "department": string,
  "is_stem": boolean,
  "duration_months": number or null,
  "university_city": string or null — only if a city is mentioned in the snippets, otherwise null,
  "match_rationale": string,
  "website_url": string — must be one of the URLs that appears explicitly in the snippets above
}

If no relevant master's program is found in the snippets, respond with exactly: null`;

  let raw: string;
  try {
    raw = await callLovableAI({ apiKey, system, user, maxTokens: 1500 });
  } catch (e) {
    console.error("AI extraction error for candidate", candidate.name, e);
    return null;
  }

  const trimmed = raw.trim();
  if (/^null$/i.test(trimmed)) return null;

  let extracted: ExtractedProgram;
  try {
    extracted = parseJsonLoose(raw);
    if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return null;
  } catch {
    return null; // one bad candidate should not fail the whole job
  }

  if (!extracted.program_name || !extracted.website_url) return null;

  const normalizedUrl = normalizeUrl(extracted.website_url);
  if (!liveUrls.has(normalizedUrl)) {
    // anti-hallucination: the AI must cite a URL that was actually in the snippets
    console.log("discard candidate (hallucinated URL)", candidate.name, extracted.website_url);
    return null;
  }

  if (!matchesTargetMajor(extracted.program_name, extracted.department, majorTokens)) {
    console.log("discard candidate (major mismatch)", candidate.name, extracted.program_name);
    return null;
  }

  let program_url: string | null;
  try {
    program_url = await resolveProgramUrl({
      university_name: candidate.name,
      program_name: extracted.program_name,
      degree_type: extracted.degree_type,
      website_url: normalizedUrl,
    });
  } catch (e) {
    console.error("resolveProgramUrl error", candidate.name, e);
    program_url = normalizedUrl;
  }

  return {
    ...extracted,
    website_url: normalizedUrl,
    university_name: candidate.name,
    university_country: candidate.country,
    qs_ranking: candidate.rank_value,
    qs_ranking_band: candidate.rank_display,
    program_url,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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

    // Enforce tier limits BEFORE spending any calls
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

    const major = profile.target_major ?? "";
    if (!major) throw new Error("Please set a target major before running discovery.");

    const country: string = (profile.target_country ?? "").trim();
    if (!country) throw new Error("Please select a target country before running discovery.");

    const window = TIER_WINDOWS[profile.target_tier as string];
    if (!window) throw new Error("Please select a ranking preference before running discovery.");

    const majorTokens = tokenize(major);

    // Load already-shown university names for exclusion
    const { data: existing } = await admin
      .from("user_entries")
      .select("university:universities(name)")
      .eq("user_id", userId);
    const excludedNames = new Set(
      (existing ?? [])
        .map((e: any) => (e.university?.name ?? "").toLowerCase().trim())
        .filter((n: string) => n.length > 0),
    );

    // Pull eligible candidate universities from the authoritative QS reference table
    const { data: qsRows, error: qsErr } = await admin
      .from("qs_rankings")
      .select("id, rank_display, rank_value, name, country")
      .eq("country", country)
      .gte("rank_value", window.min)
      .lte("rank_value", window.max);
    if (qsErr) throw qsErr;

    const eligible = (qsRows ?? []).filter((r) => !excludedNames.has(r.name.toLowerCase().trim())) as QsRankingRow[];

    if (eligible.length === 0) {
      await admin
        .from("discover_jobs")
        .update({ status: "done", error: "no_matches_for_targets", completed_at: new Date().toISOString() })
        .eq("id", jobId);
      await admin
        .from("profiles")
        .update({ [cols.discoverUsed]: view.discoverUsed + 1 })
        .eq("id", userId);
      return new Response(JSON.stringify({ ok: true, count: 0 }), {
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    const candidates = shuffle(eligible).slice(0, CANDIDATE_SAMPLE_SIZE);

    // Search + extract per candidate, in parallel. Any FirecrawlProviderError
    // (out of credits / provider outage) should abort the whole job, same as
    // the old behavior — everything else is a soft per-candidate skip.
    const settled = await Promise.allSettled(
      candidates.map((c) => discoverForCandidate(c, profile, major, apiKey, majorTokens)),
    );

    for (const s of settled) {
      if (s.status === "rejected" && s.reason instanceof FirecrawlProviderError) {
        providerErrorCode = s.reason.code;
        throw s.reason;
      }
    }

    const resolvedPrograms: CandidateResult[] = settled
      .filter((s): s is PromiseFulfilledResult<CandidateResult | null> => s.status === "fulfilled")
      .map((s) => s.value)
      .filter((v): v is CandidateResult => v !== null);

    // Order by score, cap to final result size. We do NOT re-query for more
    // candidates if fewer than FINAL_RESULT_CAP survived — return what was found.
    const finalPrograms = resolvedPrograms
      .map((p) => ({ ...p, _score: computeScore(profile, p) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, FINAL_RESULT_CAP);

    for (const p of finalPrograms) {
      // Upsert university — name/country are the QS-canonical values (source of truth)
      const { data: existingUniRows, error: uniSelErr } = await admin
        .from("universities")
        .select("*")
        .ilike("name", p.university_name)
        .ilike("country", p.university_country);

      if (uniSelErr) {
        console.error("university lookup failed", p.university_name, p.university_country, uniSelErr);
        continue; // skip this program rather than silently mis-branching into a duplicate insert
      }

      if ((existingUniRows ?? []).length > 1) {
        // Duplicate (name, country) rows already exist — do not guess which one is
        // canonical. Log loudly and skip so this doesn't get worse silently.
        console.error(
          "DUPLICATE university rows detected — skipping upsert",
          p.university_name,
          p.university_country,
          (existingUniRows ?? []).map((r: any) => ({ id: r.id, qs_ranking: r.qs_ranking, created_at: r.created_at })),
        );
        continue;
      }

      const existingUni = (existingUniRows ?? [])[0];
      let uniId = existingUni?.id;
      if (!uniId) {
        const { data: newUni, error: uErr } = await admin
          .from("universities")
          .insert({
            name: p.university_name,
            country: p.university_country,
            city: p.university_city,
            qs_ranking: p.qs_ranking,
            qs_ranking_band: p.qs_ranking_band,
            website_url: p.program_url ?? p.website_url,
          })
          .select()
          .single();
        if (uErr) {
          console.error("uni insert", p.university_name, uErr);
          continue;
        }
        uniId = newUni.id;
      } else {
        // Keep ranking fields fresh from the authoritative source even for existing rows
        const updates: Record<string, unknown> = {};
        if (existingUni.qs_ranking !== p.qs_ranking) updates.qs_ranking = p.qs_ranking;
        if (existingUni.qs_ranking_band !== p.qs_ranking_band) updates.qs_ranking_band = p.qs_ranking_band;
        if (Object.keys(updates).length > 0) {
          const { data: updatedUni, error: uniUpdErr } = await admin
            .from("universities")
            .update(updates)
            .eq("id", uniId)
            .select()
            .maybeSingle();
          if (uniUpdErr) {
            console.error(
              "university rank update FAILED",
              p.university_name,
              "attempted:",
              updates,
              "error:",
              uniUpdErr,
            );
          } else if (!updatedUni) {
            console.error(
              "university rank update returned no row (likely blocked by RLS on service role, or id mismatch)",
              p.university_name,
              uniId,
            );
          } else {
            console.log(
              "university rank corrected",
              p.university_name,
              "qs_ranking:",
              existingUni.qs_ranking,
              "->",
              updatedUni.qs_ranking,
            );
          }
        }
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

      const { error: eErr } = await admin.from("user_entries").insert({
        user_id: userId,
        university_id: uniId,
        program_id: progId,
        status: "scored",
        source: "scored",
        score: computeScore(profile, p),
        match_rationale: p.match_rationale,
      });
      if (eErr && !eErr.message.includes("duplicate")) console.error("entry insert", eErr);
    }

    const doneUpdate: Record<string, unknown> = { status: "done", completed_at: new Date().toISOString() };
    if (finalPrograms.length === 0) doneUpdate.error = "no_matches_for_targets";
    await admin.from("discover_jobs").update(doneUpdate).eq("id", jobId);

    // Always increment env-scoped discover_runs_used (both tiers are metered)
    await admin
      .from("profiles")
      .update({ [cols.discoverUsed]: view.discoverUsed + 1 })
      .eq("id", userId);

    return new Response(JSON.stringify({ ok: true, count: finalPrograms.length }), {
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
