// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import {
  categorizeUrl,
  firecrawlScrape,
  firecrawlSearch,
  isSameOrSubDomain,
  normalizeUrl,
  scrapeUniqueUrls,
  type FirecrawlDocument,
  type FirecrawlResult,
  type SubPageCategory,
} from "../_shared/firecrawl.ts";

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

function sourceContext(docs: FirecrawlDocument[], perDocCap = 8000, totalCap = 90000): string {
  const out = docs.map((doc, index) => {
    const body = doc.markdown.replace(/\s+/g, " ").slice(0, perDocCap);
    const cat = (doc as any)._category ? ` [${(doc as any)._category}]` : "";
    return `SOURCE ${index + 1}${cat}\nURL: ${doc.url}\nTitle: ${doc.title ?? ""}\nContent:\n${body}`;
  }).join("\n\n---\n\n");
  return out.slice(0, totalCap);
}

const TARGET_CATEGORIES: SubPageCategory[] = [
  "admissions",
  "deadlines",
  "requirements",
  "tuition",
  "funding",
  "class_profile",
  "career",
  "curriculum",
  "international",
];

const DEADLINE_URL_KEYWORDS = [
  "deadline",
  "deadlines",
  "apply",
  "application",
  "how-to-apply",
  "admissions",
  "apply-now",
  "dates",
  "important-dates",
  "rounds",
  "timeline",
];

/**
 * Dedicated deadline-page discovery. Runs in parallel with the main enrichment
 * gather. Returns scraped markdown of up to 3 deadline-oriented pages plus a
 * concatenated context string.
 */
async function gatherDeadlineSources(
  universityName: string,
  programName: string,
  mainDoc: FirecrawlDocument | null,
  officialHost: string | null,
): Promise<{ docs: FirecrawlDocument[]; context: string }> {
  const candidates: string[] = [];
  const seen = new Set<string>();

  if (mainDoc?.links?.length) {
    for (const raw of mainDoc.links) {
      let abs = raw;
      try { abs = new URL(raw, mainDoc.url).toString(); } catch { continue; }
      const norm = normalizeUrl(abs);
      if (!norm || seen.has(norm)) continue;
      if (!isSameOrSubDomain(norm, officialHost)) continue;
      const lower = norm.toLowerCase();
      if (DEADLINE_URL_KEYWORDS.some((kw) => lower.includes(kw))) {
        seen.add(norm);
        candidates.push(norm);
      }
    }
  }

  let deadlineDocs: FirecrawlDocument[] = [];
  if (candidates.length > 0) {
    deadlineDocs = await scrapeUniqueUrls(candidates, 3, { concurrency: 3, maxMarkdownChars: 12000 });
  } else {
    const year = new Date().getFullYear();
    const queries = [
      `${universityName} ${programName} application deadline ${year} ${year + 1} rounds`,
      `${universityName} ${programName} when to apply deadline dates rounds`,
    ];
    if (officialHost) queries.push(`site:${officialHost} ${programName} deadline`);
    const batches = await Promise.all(queries.map((q) => firecrawlSearch(q, { limit: 5 })));
    const urls: string[] = [];
    for (const results of batches) {
      for (const r of results) {
        const norm = normalizeUrl(r.url);
        if (!seen.has(norm) && (isSameOrSubDomain(norm, officialHost) || !officialHost)) {
          seen.add(norm);
          urls.push(norm);
          if (urls.length >= 5) break;
        }
      }
      if (urls.length >= 5) break;
    }
    deadlineDocs = await scrapeUniqueUrls(urls, 3, { concurrency: 3, maxMarkdownChars: 12000 });
  }

  const context = deadlineDocs
    .map((d, i) => `SOURCE ${i + 1}\nURL: ${d.url}\nTitle: ${d.title ?? ""}\nContent:\n${d.markdown.replace(/\s+/g, " ").slice(0, 12000)}`)
    .join("\n\n---\n\n");
  return { docs: deadlineDocs, context };
}

async function extractDeadlines(opts: {
  apiKey: string;
  universityName: string;
  programName: string;
  targetIntake: string | null;
  deadlineContext: string;
  fallbackContext: string;
}): Promise<{ deadline_type: "fixed" | "rolling" | "tbd"; deadlines: Array<{ round: string; deadline_date: string | null; decision_date: string | null; notes: string | null }>; raw_deadline_text: string }> {
  const system = `You are an admissions deadline extraction specialist. Your only job is to find and extract every application deadline mentioned in the content provided.

RULES:
- Extract every date that relates to applying, submitting documents, receiving a decision, or getting notified.
- University websites use many formats for deadlines. Recognize all of them: tables, bullet lists, prose sentences, headers, bold text, and numbered rounds.
- For MBA programs: look for Round 1 / Round 2 / Round 3 (or R1/R2/R3) — each has its own application deadline and decision date. Extract all rounds separately.
- For non-MBA programs: look for Early Action, Early Decision, Regular Decision, Priority Deadline, Final Deadline, Rolling Admission.
- Date formats vary: 'January 15, 2026', 'Jan 15', '1/15/26', '15 January', 'November 1st', 'Fall 2026'. Extract whatever format is present.
- If no year is specified on a date, infer the most logical upcoming year based on the intake term context. If a Fall intake program lists 'November 1' with no year, it means the upcoming November 1 before that Fall term.
- If the program says 'rolling admissions' or 'applications reviewed on a rolling basis', set deadline_type to 'rolling' and still extract any priority deadline dates mentioned.
- If no deadlines are found anywhere in the content, return deadline_type: 'tbd' and an empty deadlines array.
- Never return null for deadline_type — always return 'fixed', 'rolling', or 'tbd'.
- Look for these deadline label variations: Application Deadline / App Deadline / Submit By / Due Date / Application Due / Deadline to Apply / Applications Due / Apply By / Submit Application / Round 1 Deadline / R1 / First Round / Early Deadline / Priority Deadline / Early Action Deadline / Regular Deadline / Final Deadline / Late Deadline / Document Deadline / Materials Due / Supporting Documents Due / Decision Date / Notification Date / Decision Released / Interview Invitation / Interview Date / Scholarship Deadline / Financial Aid Deadline`;

  const today = new Date().toISOString().slice(0, 10);
  const combined = [
    opts.deadlineContext ? `=== DEADLINE PAGES (highest priority for dates) ===\n${opts.deadlineContext}` : "",
    opts.fallbackContext ? `=== OTHER SCRAPED CONTENT ===\n${opts.fallbackContext}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 80000);

  const user = `Extract all application deadlines for this program from the content below. The current date is ${today}. The program intake is ${opts.targetIntake ?? "unspecified"}.

Program: ${opts.programName}
University: ${opts.universityName}

Content:
${combined}

Return ONLY this JSON, no markdown fences:
{
  "deadline_type": "fixed" | "rolling" | "tbd",
  "deadlines": [
    {
      "round": string,
      "deadline_date": string or null,
      "decision_date": string or null,
      "notes": string or null
    }
  ],
  "raw_deadline_text": string
}`;

  try {
    const raw = await callLovableAI({ apiKey: opts.apiKey, system, user, maxTokens: 4096 });
    const parsed = parseJsonLoose(raw);
    const dt = parsed?.deadline_type;
    const deadline_type: "fixed" | "rolling" | "tbd" = dt === "fixed" || dt === "rolling" || dt === "tbd" ? dt : "tbd";
    const deadlines = Array.isArray(parsed?.deadlines)
      ? parsed.deadlines.map((d: any) => ({
          round: typeof d?.round === "string" && d.round.trim() ? d.round : "Application Deadline",
          deadline_date: typeof d?.deadline_date === "string" ? d.deadline_date : null,
          decision_date: typeof d?.decision_date === "string" ? d.decision_date : null,
          notes: typeof d?.notes === "string" ? d.notes : null,
        }))
      : [];
    const raw_deadline_text = typeof parsed?.raw_deadline_text === "string" ? parsed.raw_deadline_text : "";
    return { deadline_type, deadlines, raw_deadline_text };
  } catch (e) {
    console.error("extractDeadlines failed", e);
    return { deadline_type: "tbd", deadlines: [], raw_deadline_text: "" };
  }
}

/**
 * Three-step deep crawl:
 *   1. Locate the main program page (from websiteUrl or a targeted search) and scrape it with links.
 *   2. Categorize discovered same-domain links; scrape the top link per category in parallel.
 *   3. Fill any missing category via a targeted `site:` search + scrape, plus rankings.
 */
async function gatherLiveSources(
  universityName: string,
  programName: string,
  websiteUrl?: string | null,
): Promise<{ docs: FirecrawlDocument[]; mainDoc: FirecrawlDocument | null; officialHost: string | null }> {
  let officialHost = hostname(websiteUrl);

  // ---------- STEP 1: main program page ----------
  let mainDoc: FirecrawlDocument | null = null;
  if (websiteUrl) {
    mainDoc = await firecrawlScrape(websiteUrl, { includeLinks: true, maxMarkdownChars: 14000 });
  }
  if (!mainDoc) {
    const seedQuery = officialHost
      ? `site:${officialHost} ${programName} master's program`
      : `${universityName} ${programName} master's program official site`;
    const seeds = await firecrawlSearch(seedQuery, { limit: 5 });
    const ranked = seeds.sort((a, b) => resultScore(b, officialHost, programName) - resultScore(a, officialHost, programName));
    for (const s of ranked) {
      mainDoc = await firecrawlScrape(s.url, { includeLinks: true, maxMarkdownChars: 14000 });
      if (mainDoc) break;
    }
  }
  if (mainDoc && !officialHost) officialHost = hostname(mainDoc.url);
  const docs: FirecrawlDocument[] = [];
  const covered = new Set<SubPageCategory>();
  if (mainDoc) {
    (mainDoc as any)._category = "overview";
    docs.push(mainDoc);
    covered.add("overview" as SubPageCategory);
  }

  // ---------- STEP 2: categorize + scrape sub-pages from main page links ----------
  const linkPool: Array<{ url: string; category: SubPageCategory }> = [];
  const seenUrls = new Set<string>(docs.map((d) => normalizeUrl(d.url)));
  if (mainDoc?.links?.length) {
    for (const raw of mainDoc.links) {
      let abs = raw;
      try {
        abs = new URL(raw, mainDoc.url).toString();
      } catch {
        continue;
      }
      const norm = normalizeUrl(abs);
      if (!norm || seenUrls.has(norm)) continue;
      if (!isSameOrSubDomain(norm, officialHost)) continue;
      const cat = categorizeUrl(norm);
      if (!cat) continue;
      linkPool.push({ url: norm, category: cat });
    }
  }

  // Pick the first link per category to avoid over-scraping.
  const perCat = new Map<SubPageCategory, string[]>();
  for (const item of linkPool) {
    const arr = perCat.get(item.category) ?? [];
    if (arr.length < 2) arr.push(item.url);
    perCat.set(item.category, arr);
  }
  const subPageUrls: Array<{ url: string; category: SubPageCategory }> = [];
  for (const [cat, urls] of perCat) {
    for (const url of urls) subPageUrls.push({ url, category: cat });
  }

  const step2Docs = await scrapeUniqueUrls(
    subPageUrls.map((x) => x.url),
    18,
    { concurrency: 6, maxMarkdownChars: 10000 },
  );
  const urlToCat = new Map(subPageUrls.map((x) => [normalizeUrl(x.url), x.category]));
  for (const d of step2Docs) {
    const key = normalizeUrl(d.url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    const cat = urlToCat.get(key) ?? categorizeUrl(d.url);
    if (cat) {
      (d as any)._category = cat;
      covered.add(cat);
    }
    docs.push(d);
  }

  // ---------- STEP 3: fill missing categories via targeted search + rankings ----------
  const missing = TARGET_CATEGORIES.filter((c) => !covered.has(c));
  const catQueries: Record<SubPageCategory, string> = {
    overview: `${programName} overview`,
    admissions: `${programName} admissions how to apply`,
    deadlines: `${programName} application deadlines dates`,
    requirements: `${programName} admission requirements prerequisites`,
    tuition: `${programName} tuition fees cost of attendance`,
    funding: `${programName} funding scholarships assistantship financial aid`,
    class_profile: `${programName} class profile student statistics`,
    career: `${programName} career outcomes placement salary employers`,
    curriculum: `${programName} curriculum courses program structure`,
    international: `${programName} international students STEM OPT visa`,
    faculty: `${programName} faculty research`,
  };
  const gapQueries: string[] = missing.map((cat) => {
    const base = catQueries[cat];
    return officialHost ? `site:${officialHost} ${base}` : `${universityName} ${base}`;
  });
  gapQueries.push(`${universityName} ${programName} QS ranking US News ranking`);

  const gapBatches = await Promise.all(gapQueries.map((q) => firecrawlSearch(q, { limit: 5 })));
  const gapUrls: string[] = [];
  for (const results of gapBatches) {
    const top = results
      .filter((r) => isSameOrSubDomain(r.url, officialHost) || /qs|usnews|topuniversities|ranking/i.test(r.url))
      .sort((a, b) => resultScore(b, officialHost, programName) - resultScore(a, officialHost, programName))
      .slice(0, 2);
    for (const t of top) {
      const norm = normalizeUrl(t.url);
      if (!seenUrls.has(norm)) gapUrls.push(norm);
    }
  }
  const step3Docs = await scrapeUniqueUrls(gapUrls, 10, { concurrency: 5, maxMarkdownChars: 9000 });
  for (const d of step3Docs) {
    const key = normalizeUrl(d.url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    (d as any)._category = categorizeUrl(d.url) ?? "overview";
    docs.push(d);
  }

  // Prioritize: official host first, then category diversity.
  const officialDocs = docs.filter((d) => officialHost && d.url.toLowerCase().includes(officialHost.toLowerCase()));
  const otherDocs = docs.filter((d) => !officialHost || !d.url.toLowerCase().includes(officialHost.toLowerCase()));
  return { docs: [...officialDocs, ...otherDocs].slice(0, 20), mainDoc, officialHost };
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

    const gathered = await gatherLiveSources(university_name, program_name, website_url);
    const docs = gathered.docs;
    if (docs.length === 0) {
      throw new Error("No live university sources could be found or scraped. Please retry later.");
    }
    const validSources = new Set(docs.map((doc) => normalizeUrl(doc.url)));

    // Kick off dedicated deadline discovery + extraction in parallel with the main enrichment call.
    const deadlinePromise = (async () => {
      const { docs: deadlineDocs, context: deadlineContext } = await gatherDeadlineSources(
        university_name,
        program_name,
        gathered.mainDoc,
        gathered.officialHost,
      );
      const fallbackContext = deadlineDocs.length === 0 ? sourceContext(docs, 6000, 40000) : "";
      return extractDeadlines({
        apiKey,
        universityName: university_name,
        programName: program_name,
        targetIntake: null,
        deadlineContext,
        fallbackContext,
      });
    })();

    const system = "You are a graduate admissions data extraction specialist. You have been given content scraped from multiple pages of a university's official website. Your job is to find and extract every piece of admissions data present in the content.\n\nEXTRACTION RULES:\n- Be aggressive, not conservative. If the data is in the content in ANY form, extract it. Do not return null just because the format is unusual or the label is different from what you expected.\n- University websites use many different labels for the same field. You must recognize all of them. Examples below.\n- If a field is genuinely absent from all content, use null. But err on the side of extracting rather than skipping.\n- Never fabricate values. Only extract what is in the content.\n- When a value appears as a range (e.g. '310-330'), store the range string in the corresponding _range field and leave the numeric field null. Do not compute midpoints or averages from ranges.\n- When a value appears as 'average', 'median', or 'middle 80%' — extract whichever is available, preferring average, then median.\n- For GRE: never average or calculate. If the website publishes a range like '310-330', store it as a string in the _range field and leave the number field null. If it publishes a single average like '318', store it as a number and leave the _range field null. Both can be populated if the website provides both. Extract composite (gre_total), quant (gre_quant), and verbal (gre_verbal) independently — whichever the site publishes.\n\nFor test requirements, look for these label variations and map them to the correct field:\nGRE labels: GRE, GRE Score, GRE Requirement, Graduate Record Examination, GRE General Test, GRE Waiver, GRE Optional, GRE Required\nGMAT labels: GMAT, GMAT Score, GMAT Requirement, Graduate Management Admission Test, GMAT Waiver, GMAT Optional, GMAT Required, GMAT Focus\nAlso look for combined statements like:\n- 'GRE/GMAT optional' → set both to 'optional'\n- 'GRE or GMAT required' → set both to 'required'\n- 'GMAT required, GRE not accepted' → gmat: required, gre: not_required\n- 'Test scores not required' → set both to 'not_required'\n- 'GRE waived for applicants with X' → gre: 'waived', put condition in gre_gmat_notes\n- 'No GRE/GMAT required' → both: 'not_required'\n- 'GRE optional, GMAT not accepted' → gre: optional, gmat: not_required\nFor gre_gmat_notes: capture any important conditions such as waiver criteria, minimum score requirements, or exceptions (e.g. 'GRE waived for applicants with 2+ years work experience', 'GMAT required for applicants without a quantitative undergraduate background').\nIf test requirement information is completely absent from all scraped content, return null for both fields — do not guess.";

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
    "gre_required": "required" | "optional" | "not_required" | "waived" or null,
    "gmat_required": "required" | "optional" | "not_required" | "waived" or null,
    "gre_gmat_notes": string or null,
    "english_test_requirement": "required" | "optional" | "not_required" or null,
    "accepted_english_tests": [string] or null,
    "application_fee": number or null,
    "application_fee_currency": string or null
  },
  "class_profile": {
    "profile_scope": "program" | "school",
    "gre_total": number or null,
    "gre_total_range": string or null,
    "gre_quant": number or null,
    "gre_quant_range": string or null,
    "gre_verbal": number or null,
    "gre_verbal_range": string or null,
    "avg_gmat": number or null,
    "avg_gmat_note": string or null,
    "avg_gpa": number or null,
    "avg_gpa_note": string or null,
    "avg_ielts": number or null,
    "avg_ielts_note": string or null,
    "avg_toefl": number or null,
    "avg_toefl_note": string or null,
    "avg_work_exp_years": number or null,
    "avg_work_exp_note": string or null,
    "class_size": number or null,
    "intl_student_pct": number or null,
    "intl_student_pct_note": string or null,
    "is_stem": boolean or null
  },
  "tuition_and_funding": {
    "tuition_amount": number or null,
    "tuition_note": string or null,
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
    "avg_salary_note": string or null,
    "avg_salary_currency": string or null,
    "top_employers": [string] or null,
    "top_industries": [string] or null,
    "intl_student_salary_note": string or null,
    "salary_breakdown_notes": string or null
  },
  "sources": [string]
}`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 32000 });
    let data: any;
    try {
      data = parseJsonLoose(raw);
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

    // Await dedicated deadline extraction and merge.
    const deadlineResult = await deadlinePromise;

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

    // Merge: dedicated deadline call wins when it found anything; otherwise fall back to main call.
    const mainDeadlines = Array.isArray(ad.deadlines) ? ad.deadlines : [];
    const finalDeadlines = deadlineResult.deadlines.length > 0 ? deadlineResult.deadlines : mainDeadlines;
    const finalDeadlineType = deadlineResult.deadlines.length > 0
      ? deadlineResult.deadline_type
      : (ad.deadline_type ?? deadlineResult.deadline_type);

    await admin.from("program_admissions").upsert({
      program_id,
      apply_url: validUrlOrNull(ad.apply_url, validSources),
      deadline_type: finalDeadlineType ?? null,
      deadlines: finalDeadlines,
      deadline_raw_text: deadlineResult.raw_deadline_text || null,
      required_materials: ad.required_materials ?? [],
      gre_required: ad.gre_required ?? null,
      gmat_required: ad.gmat_required ?? null,
      gre_gmat_notes: ad.gre_gmat_notes ?? null,
      english_test_requirement: ad.english_test_requirement ?? null,
      accepted_english_tests: ad.accepted_english_tests ?? null,
      application_fee: ad.application_fee ?? null,
      application_fee_currency: ad.application_fee_currency ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_class_profile").upsert({
      program_id,
      profile_scope: cp.profile_scope ?? null,
      gre_total: cp.gre_total ?? null,
      gre_total_range: cp.gre_total_range ?? null,
      gre_quant: cp.gre_quant ?? null,
      gre_quant_range: cp.gre_quant_range ?? null,
      gre_verbal: cp.gre_verbal ?? null,
      gre_verbal_range: cp.gre_verbal_range ?? null,
      avg_gmat: cp.avg_gmat ?? null,
      avg_gmat_note: cp.avg_gmat_note ?? null,
      avg_gpa: cp.avg_gpa ?? null,
      avg_gpa_note: cp.avg_gpa_note ?? null,
      avg_ielts: cp.avg_ielts ?? null,
      avg_ielts_note: cp.avg_ielts_note ?? null,
      avg_toefl: cp.avg_toefl ?? null,
      avg_toefl_note: cp.avg_toefl_note ?? null,
      avg_work_exp_years: cp.avg_work_exp_years ?? null,
      avg_work_exp_note: cp.avg_work_exp_note ?? null,
      class_size: cp.class_size ?? null,
      intl_pct: cp.intl_student_pct ?? null,
      intl_student_pct_note: cp.intl_student_pct_note ?? null,
      is_stem: cp.is_stem ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_funding").upsert({
      program_id,
      tuition_amount: tf.tuition_amount ?? null,
      tuition_note: tf.tuition_note ?? null,
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
      avg_salary_note: co.avg_salary_note ?? null,
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