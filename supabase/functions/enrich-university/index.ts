// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { tavilySearch, tavilyExtract, formatExtractContext, formatSearchContext, getTavilyKeyOrThrow } from "../_shared/tavily.ts";

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

    // Ground via Tavily: search for the program's official pages, then extract content.
    const tavilyKey = getTavilyKeyOrThrow();
    const queries = [
      `${program_name} ${university_name} master's admissions deadline tuition official site`,
      `${program_name} ${university_name} class profile career outcomes salary employers`,
    ];
    const searchHits: any[] = [];
    for (const q of queries) {
      try {
        const r = await tavilySearch({ apiKey: tavilyKey, query: q, maxResults: 5, searchDepth: "advanced" });
        for (const h of r.results) searchHits.push(h);
      } catch (err) { console.error("tavily search failed", q, err); }
    }
    // Pick top URLs to extract (prefer official domain if given)
    const seenUrls = new Set<string>();
    const officialHost = website_url ? (() => { try { return new URL(website_url).host.replace(/^www\./, ""); } catch { return null; } })() : null;
    const orderedHits = [...searchHits].sort((a, b) => {
      const aOff = officialHost && a.url?.includes(officialHost) ? 1 : 0;
      const bOff = officialHost && b.url?.includes(officialHost) ? 1 : 0;
      return bOff - aOff;
    });
    const extractUrls: string[] = [];
    for (const h of orderedHits) {
      if (!h.url || seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      extractUrls.push(h.url);
      if (extractUrls.length >= 4) break;
    }
    let extractContext = "";
    if (extractUrls.length) {
      try {
        const ext = await tavilyExtract({ apiKey: tavilyKey, urls: extractUrls, extractDepth: "advanced" });
        extractContext = formatExtractContext(ext.results ?? [], 4000);
      } catch (err) { console.error("tavily extract failed", err); }
    }
    const searchContext = formatSearchContext(searchHits.slice(0, 10), 500);
    const groundingContext = [
      searchContext ? `SEARCH SNIPPETS:\n${searchContext}` : "",
      extractContext ? `EXTRACTED PAGE CONTENT:\n${extractContext}` : "",
    ].filter(Boolean).join("\n\n===\n\n") || "(no web context available)";

    const system = "You are a graduate admissions research assistant. Your job is to research a specific master's program in depth and return structured, accurate data. Only return values you can verify from current, publicly available sources such as the university's official website, official program pages, QS rankings, or well-known ranking publications. Use null for any field you cannot verify — never estimate, never guess, never fabricate numeric values. Prioritize the official university website as the primary source for deadlines, fees, and requirements.";

    const user = `Research this master's program thoroughly:
University: ${university_name}
Program: ${program_name}
Official website: ${website_url ?? "unknown"}

You have been given LIVE WEB CONTEXT from Tavily below (search snippets and extracted page content). Use these as the primary source of truth. Any value you return MUST be supported by this context or another verifiable source. If a field is not supported, return null. Populate the "sources" array with the URLs you actually used from this context.

WEB CONTEXT:
${groundingContext}

Return ONLY the following JSON, no other text, no markdown fences. Use null for any field you cannot verify from a current source.
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

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 16000 });
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

    await admin.from("programs").update({
      program_description: ov.program_description ?? null,
      us_news_ranking: ov.us_news_ranking ?? null,
      school_ranking: ov.qs_ranking ?? null,
      apply_url: ad.apply_url ?? null,
      last_verified_at: new Date().toISOString(),
    }).eq("id", program_id);

    await admin.from("program_admissions").upsert({
      program_id,
      apply_url: ad.apply_url ?? null,
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

    if (Array.isArray(data.sources)) {
      // Replace sources to keep them current
      await admin.from("program_research_sources").delete().eq("program_id", program_id);
      for (const url of data.sources) {
        if (typeof url === "string" && url.trim()) {
          await admin.from("program_research_sources").insert({ program_id, url });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
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