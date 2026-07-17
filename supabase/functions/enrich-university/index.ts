// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { firecrawlSearch, normalizeUrl, scrapeUniqueUrls, type FirecrawlDocument, type FirecrawlResult } from "../_shared/firecrawl.ts";

function hostname(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_e) {
    return null;
  }
}

function resultScore(result: FirecrawlResult, officialHost: string | null, programName: string): number {
  const haystack = `${result.url} ${result.title ?? ""} ${result.description ?? ""}`.toLowerCase();
  const programTokens = programName.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  let score = 0;
  if (officialHost && result.url.toLowerCase().includes(officialHost.toLowerCase())) score += 40;
  for (const token of programTokens) if (haystack.includes(token)) score += 4;
  if (/admission|apply|deadline|requirement/.test(haystack)) score += 8;
  if (/tuition|fee|funding|scholarship|assistantship|cost/.test(haystack)) score += 8;
  if (/career|employment|outcome|salary|placement|employer/.test(haystack)) score += 8;
  if (/class-profile|profile|statistics|stem|international/.test(haystack)) score += 6;
  if (/ranking|rankings|qs|usnews|u\.s\. news/.test(haystack)) score += 4;
  if (/linkedin\.com|facebook\.com|instagram\.com|youtube\.com|reddit\.com|quora\.com/i.test(result.url)) score -= 100;
  return score;
}

function sourceContext(docs: FirecrawlDocument[]): string {
  return docs.map((doc, index) => {
    const body = doc.markdown.replace(/\s+/g, " ").slice(0, 9000);
    return `SOURCE ${index + 1}\nURL: ${doc.url}\nTitle: ${doc.title ?? ""}\nDescription: ${doc.description ?? ""}\nContent:\n${body}`;
  }).join("\n\n---\n\n").slice(0, 65000);
}

async function gatherLiveSources(universityName: string, programName: string, websiteUrl?: string | null): Promise<FirecrawlDocument[]> {
  const officialHost = hostname(websiteUrl);
  const sitePrefix = officialHost ? `site:${officialHost} ` : "";
  const queries = [
    `${sitePrefix}${universityName} ${programName} official master's program`,
    `${sitePrefix}${universityName} ${programName} admissions requirements deadlines apply`,
    `${sitePrefix}${universityName} ${programName} tuition fees funding scholarships assistantship`,
    `${sitePrefix}${universityName} ${programName} class profile statistics international students STEM`,
    `${sitePrefix}${universityName} ${programName} career outcomes placement salary employers`,
    `${universityName} ${programName} QS ranking US News ranking`,
  ];

  const batches = await Promise.all(queries.map((query) => firecrawlSearch(query, { limit: 8 })));
  const ranked = batches.flat()
    .sort((a, b) => resultScore(b, officialHost, programName) - resultScore(a, officialHost, programName));
  const urls = [websiteUrl, ...ranked.map((r) => r.url)].filter((url): url is string => !!url);
  const docs = await scrapeUniqueUrls(urls, 12);
  const officialDocs = docs.filter((doc) => officialHost && doc.url.toLowerCase().includes(officialHost.toLowerCase()));
  const otherDocs = docs.filter((doc) => !officialHost || !doc.url.toLowerCase().includes(officialHost.toLowerCase()));
  return [...officialDocs, ...otherDocs].slice(0, 10);
}

function validUrlOrNull(url: unknown, validSources: Set<string>): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const normalized = normalizeUrl(url);
  return validSources.has(normalized) ? normalized : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { program_id, university_name, program_name, website_url } = await req.json();
    if (!program_id || !university_name || !program_name) throw new Error("program_id, university_name, program_name required");

    const docs = await gatherLiveSources(university_name, program_name, website_url);
    if (docs.length === 0) {
      throw new Error("No live university sources could be found or scraped. Please retry later.");
    }
    const validSources = new Set(docs.map((doc) => normalizeUrl(doc.url)));

    const system = "You are a graduate admissions research assistant. Extract structured data only from the live web sources provided by the user. Do not use memory. Do not browse independently. Do not estimate, infer, or fill gaps from general knowledge. If a field is not explicitly supported by the provided sources, return null or an empty array. Prefer official university sources for admissions, fees, funding, class profile, career outcomes, and city/program details. Use ranking sources only for ranking fields.";

    const user = `Research this master's program using ONLY the live scraped source content below:
University: ${university_name}
Program: ${program_name}
Official website: ${website_url ?? "unknown"}

LIVE SOURCES:
${sourceContext(docs)}

Return ONLY the following JSON, no other text, no markdown fences. Use null for any scalar field that is not clearly verified in the sources. Use [] for arrays with no verified items. The "sources" array must contain only exact URLs from the LIVE SOURCES above that directly support the extracted data.
{
  "overview": {
    "program_description": string or null,
    "us_news_ranking": number or null,
    "qs_ranking": number or null
  },
  "admissions": {
    "apply_url": string or null,
    "deadline_type": "fixed" | "rolling" | "tbd",
    "deadlines": [{"round": string, "deadline_date": string or null, "decision_date": string or null}],
    "required_materials": [string],
    "gre_gmat_requirement": "required" | "optional" | "not_required" or null,
    "english_test_requirement": "required" | "optional" | "not_required" or null,
    "accepted_english_tests": [string] or null,
    "application_fee": number or null,
    "application_fee_currency": string or null
  },
  "class_profile": {
    "profile_scope": "program" | "school",
    "avg_gre_quant": number or null,
    "avg_gre_verbal": number or null,
    "avg_gmat": number or null,
    "avg_gpa": number or null,
    "avg_ielts": number or null,
    "avg_toefl": number or null,
    "avg_work_exp_years": number or null,
    "class_size": number or null,
    "intl_student_pct": number or null,
    "is_stem": boolean or null
  },
  "tuition_and_funding": {
    "tuition_amount": number or null,
    "tuition_currency": string or null,
    "tuition_per": "year" | "semester" | "credit" | "program" or null,
    "tuition_as_of": string or null,
    "ga_ta_gra_available": boolean or null,
    "ga_ta_gra_notes": string or null,
    "tuition_waiver_with_assistantship": boolean or null,
    "scholarship_notes": string or null,
    "est_accommodation_low": number or null,
    "est_accommodation_high": number or null,
    "accommodation_currency": string or null,
    "est_total_cost_of_attendance": number or null
  },
  "city": {
    "city_name": string or null,
    "city_vibe": string or null,
    "nearest_major_city": string or null,
    "distance_to_major_city_km": number or null,
    "travel_time_to_major_city": string or null
  },
  "career_outcomes": {
    "placement_rate_pct": number or null,
    "avg_salary": number or null,
    "avg_salary_currency": string or null,
    "top_employers": [string] or null,
    "top_industries": [string] or null,
    "intl_student_salary_note": string or null,
    "salary_breakdown_notes": string or null
  },
  "sources": [string]
}`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 24000 });
    let data: any;
    try {
      data = parseJsonLoose(raw);
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

    const ov = data.overview ?? {};
    const ad = data.admissions ?? {};
    const cp = data.class_profile ?? {};
    const tf = data.tuition_and_funding ?? {};
    const ci = data.city ?? {};
    const co = data.career_outcomes ?? {};
    const verifiedSources = Array.isArray(data.sources)
      ? data.sources.map((url: unknown) => validUrlOrNull(url, validSources)).filter((url: string | null): url is string => !!url)
      : [];
    const fallbackSources = verifiedSources.length > 0 ? verifiedSources : docs.slice(0, 5).map((doc) => normalizeUrl(doc.url));

    await admin.from("programs").update({
      program_description: ov.program_description ?? null,
      us_news_ranking: ov.us_news_ranking ?? null,
      school_ranking: ov.qs_ranking ?? null,
      apply_url: validUrlOrNull(ad.apply_url, validSources),
      last_verified_at: new Date().toISOString(),
    }).eq("id", program_id);

    await admin.from("program_admissions").upsert({
      program_id,
      apply_url: validUrlOrNull(ad.apply_url, validSources),
      deadline_type: ad.deadline_type ?? null,
      deadlines: ad.deadlines ?? [],
      required_materials: ad.required_materials ?? [],
      gre_gmat_requirement: ad.gre_gmat_requirement ?? null,
      english_test_requirement: ad.english_test_requirement ?? null,
      accepted_english_tests: ad.accepted_english_tests ?? null,
      application_fee: ad.application_fee ?? null,
      application_fee_currency: ad.application_fee_currency ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_class_profile").upsert({
      program_id,
      profile_scope: cp.profile_scope ?? null,
      avg_gre_quant: cp.avg_gre_quant ?? null,
      avg_gre_verbal: cp.avg_gre_verbal ?? null,
      avg_gmat: cp.avg_gmat ?? null,
      avg_gpa: cp.avg_gpa ?? null,
      avg_ielts: cp.avg_ielts ?? null,
      avg_toefl: cp.avg_toefl ?? null,
      avg_work_exp_years: cp.avg_work_exp_years ?? null,
      class_size: cp.class_size ?? null,
      intl_pct: cp.intl_student_pct ?? null,
      is_stem: cp.is_stem ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_funding").upsert({
      program_id,
      tuition_amount: tf.tuition_amount ?? null,
      tuition_currency: tf.tuition_currency ?? null,
      tuition_per: tf.tuition_per ?? null,
      tuition_as_of: tf.tuition_as_of ?? null,
      ga_ta_gra_available: tf.ga_ta_gra_available ?? null,
      ga_ta_gra_notes: tf.ga_ta_gra_notes ?? null,
      tuition_waiver_with_assistantship: tf.tuition_waiver_with_assistantship ?? null,
      scholarship_notes: tf.scholarship_notes ?? null,
      est_accommodation_low: tf.est_accommodation_low ?? null,
      est_accommodation_high: tf.est_accommodation_high ?? null,
      accommodation_currency: tf.accommodation_currency ?? null,
      est_total_cost_of_attendance: tf.est_total_cost_of_attendance ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_city_info").upsert({
      program_id,
      city_name: ci.city_name ?? null,
      city_vibe: ci.city_vibe ?? null,
      nearest_major_city: ci.nearest_major_city ?? null,
      distance_to_major_city_km: ci.distance_to_major_city_km ?? null,
      travel_time_to_major_city: ci.travel_time_to_major_city ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_career_stats").upsert({
      program_id,
      placement_rate_pct: co.placement_rate_pct ?? null,
      avg_salary: co.avg_salary ?? null,
      avg_salary_currency: co.avg_salary_currency ?? null,
      top_employers: co.top_employers ?? null,
      top_industries: co.top_industries ?? null,
      intl_student_salary_note: co.intl_student_salary_note ?? null,
      salary_breakdown_notes: co.salary_breakdown_notes ?? null,
      updated_at: new Date().toISOString(),
    });

    // Replace sources with only live-scraped, non-dead links.
    await admin.from("program_research_sources").delete().eq("program_id", program_id);
    for (const url of Array.from(new Set(fallbackSources))) {
      await admin.from("program_research_sources").insert({ program_id, url });
    }

    return new Response(JSON.stringify({ ok: true, sources_checked: docs.length, sources_saved: fallbackSources.length }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-university error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});