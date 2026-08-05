// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import {
  FREE_LIMITS,
  PAID_LIMITS,
  ensureUsageWindow,
  envColumns,
  envView,
  isPaid,
  parseEnv,
} from "../_shared/limits.ts";
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

const REPUTABLE_THIRD_PARTY =
  /poetsandquants\.com|gmac\.com|businessbecause\.com|topmba\.com|usnews\.com|qs\.com|topuniversities\.com/i;

function resultScore(
  result: FirecrawlResult,
  officialHost: string | null,
  programName: string,
  scopeMode: "path" | "domain" | "open" = "domain",
): number {
  const haystack = `${result.url} ${result.title ?? ""} ${result.description ?? ""}`.toLowerCase();
  const programTokens = programName
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  let score = 0;
  if (officialHost && result.url.toLowerCase().includes(officialHost.toLowerCase())) score += 40;
  if (scopeMode === "open" && REPUTABLE_THIRD_PARTY.test(result.url)) score += 15;
  try {
    const urlPath = new URL(result.url).pathname.toLowerCase();
    const pathMatchCount = programTokens.filter((t) => urlPath.includes(t)).length;
    score += pathMatchCount * 15;
    if (/\/undergraduate\/|\/undergrad\//i.test(urlPath)) score -= 60;
  } catch {
    /* skip path scoring on malformed URL */
  }
  for (const token of programTokens) if (haystack.includes(token)) score += 4;
  if (/admission|apply|deadline|requirement/.test(haystack)) score += 8;
  if (/tuition|fee|funding|scholarship|assistantship|cost/.test(haystack)) score += 8;
  if (/career|employment|outcome|salary|placement|employer/.test(haystack)) score += 8;
  if (/class-profile|profile|statistics|stem|international/.test(haystack)) score += 6;
  if (/linkedin\.com|facebook\.com|instagram\.com|youtube\.com|reddit\.com|quora\.com/i.test(result.url)) score -= 100;
  return score;
}

function isWrongProgramPage(url: string, programName: string): boolean {
  const lower = url.toLowerCase();
  if (/\/undergraduate\/|\/undergrad\/|\/bachelor/i.test(lower)) return true;
  const otherProgramMarkers = /\/part-time-mba\/|\/phd\/|\/doctoral\/|\/executive-mba\//i;
  const programTokens = programName
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  const urlMatchesProgram = programTokens.some((t) => lower.includes(t));
  if (otherProgramMarkers.test(lower) && !urlMatchesProgram) return true;
  return false;
}

function derivePathPrefix(url: string): string | null {
  try {
    const p = new URL(url).pathname;
    if (!p || p === "/") return null;
    const segs = p.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    // Drop last segment if it looks like a leaf page (has an extension or a
    // known leaf keyword) so the prefix scopes to the program directory.
    const last = segs[segs.length - 1];
    const isLeaf =
      /\.[a-z0-9]{2,5}$/i.test(last) ||
      /^(admissions?|apply|tuition|fees?|funding|scholarships?|career|careers|outcomes?|class-profile|profile|deadlines?|requirements?|overview|index)$/i.test(
        last,
      );
    const kept = isLeaf ? segs.slice(0, -1) : segs;
    if (kept.length === 0) return null;
    return "/" + kept.join("/") + "/";
  } catch {
    return null;
  }
}

const SOURCE_CONTEXT_TOTAL_CAP = 380000;

function sourceContext(docs: FirecrawlDocument[], perDocCap = 75000, totalCap = SOURCE_CONTEXT_TOTAL_CAP): string {
  const out = docs
    .map((doc, index) => {
      const rawBody = doc.markdown.replace(/\s+/g, " ");
      const wasTruncated = rawBody.length > perDocCap;
      const body = rawBody.slice(0, perDocCap) + (wasTruncated ? " [TRUNCATED]" : "");
      const cat = (doc as any)._categories
        ? ` [${Array.from((doc as any)._categories).join("/")}]`
        : (doc as any)._category
          ? ` [${(doc as any)._category}]`
          : "";
      const truncFlag = doc.truncated ? " [SOURCE ALREADY TRUNCATED AT SCRAPE]" : "";
      return `SOURCE ${index + 1}${cat}${truncFlag}\nURL: ${doc.url}\nTitle: ${doc.title ?? ""}\nContent:\n${body}`;
    })
    .join("\n\n---\n\n");
  const finalTruncated = out.length > totalCap;
  const finalOut = out.slice(0, totalCap);
  return finalTruncated ? finalOut + "\n\n[CONTEXT TRUNCATED AT TOTAL CAP]" : finalOut;
}

const TARGET_CATEGORIES: SubPageCategory[] = ["admissions", "tuition", "funding", "class_profile", "career"];

// Hard ceiling on Firecrawl operations (scrapes + searches) per enrichment run.
const MAX_TOTAL_FIRECRAWL_OPS = 12;

async function extractDeadlines(opts: {
  apiKey: string;
  universityName: string;
  programName: string;
  targetIntake: string | null;
  deadlineContext: string;
  fallbackContext: string;
}): Promise<{
  deadline_type: "fixed" | "rolling" | "tbd";
  deadlines: Array<{ round: string; deadline_date: string | null; decision_date: string | null; notes: string | null }>;
  raw_deadline_text: string;
}> {
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
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 200000);

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
    const raw = await callLovableAI({ apiKey: opts.apiKey, system, user, maxTokens: 12000 });
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
  programUrl?: string | null,
  requestId = "unknown",
): Promise<{ docs: FirecrawlDocument[]; mainDoc: FirecrawlDocument | null; officialHost: string | null }> {
  // Prefer the more specific program_url when available.
  const primaryUrl = programUrl && programUrl.trim() ? programUrl : (websiteUrl ?? null);
  let officialHost = hostname(primaryUrl);
  const programPathPrefix = primaryUrl ? derivePathPrefix(primaryUrl) : null;
  console.log(
    `enrich-university req=${requestId}: gatherLiveSources start — primary_url=${primaryUrl ?? "none"} path_prefix=${programPathPrefix ?? "none"} used_program_url=${!!(programUrl && programUrl.trim())}`,
  );
  const catCount = TARGET_CATEGORIES.length;
  const uniqCatCount = new Set(TARGET_CATEGORIES).size;
  if (catCount !== uniqCatCount) {
    console.warn(
      `enrich-university req=${requestId}: TARGET_CATEGORIES has duplicates (${catCount} vs ${uniqCatCount})`,
    );
  }
  const opsBudget = { count: 0, hit: false };
  const canSpend = (n = 1, label = "unknown") => {
    if (opsBudget.count + n > MAX_TOTAL_FIRECRAWL_OPS) {
      opsBudget.hit = true;
      console.warn(
        `enrich-university req=${requestId}: BUDGET EXHAUSTED — rejected spend for [${label}], current=${opsBudget.count}/${MAX_TOTAL_FIRECRAWL_OPS}`,
      );
      return false;
    }
    opsBudget.count += n;
    return true;
  };
  const scrape = async (url: string, o?: Parameters<typeof firecrawlScrape>[1], label = "scrape") => {
    if (!canSpend(1, label)) return null;
    return firecrawlScrape(url, o);
  };
  const scrapeMany = async (
    urls: string[],
    limit: number,
    o?: Parameters<typeof scrapeUniqueUrls>[2],
    label = "scrapeMany",
  ) => {
    const budget = Math.max(0, Math.min(limit, urls.length, MAX_TOTAL_FIRECRAWL_OPS - opsBudget.count));
    if (budget <= 0) {
      canSpend(1, label);
      return [];
    }
    opsBudget.count += budget;
    return scrapeUniqueUrls(urls, budget, o);
  };
  const search = async (q: string, o?: Parameters<typeof firecrawlSearch>[1], label = "search") => {
    if (!canSpend(1, label)) return [];
    try {
      return await firecrawlSearch(q, o);
    } catch (e) {
      console.warn(
        `enrich-university req=${requestId}: firecrawl search soft-fail [${label}] — ${(e as Error).message}`,
      );
      return [];
    }
  };

  // ---------- STEP 1: main program page ----------
  let mainDoc: FirecrawlDocument | null = null;
  if (primaryUrl) {
    mainDoc = await scrape(primaryUrl, { includeLinks: true, maxMarkdownChars: 75000 }, "step1-main-page");
  }
  if (!mainDoc) {
    console.log(
      `enrich-university req=${requestId}: falling back to blind discovery — no stored program_url produced a scrape`,
    );
    const seedQuery = officialHost
      ? `site:${officialHost} ${programName} master's program`
      : `${universityName} ${programName} master's program official site`;
    const seeds = await search(seedQuery, { limit: 1 }, "step1-seed-search");
    const ranked = seeds.sort(
      (a, b) => resultScore(b, officialHost, programName) - resultScore(a, officialHost, programName),
    );
    for (const s of ranked) {
      mainDoc = await scrape(s.url, { includeLinks: true, maxMarkdownChars: 75000 }, "step1-seed-scrape");
      if (mainDoc) break;
    }
  } else {
    console.log(`enrich-university req=${requestId}: used stored program URL as authoritative start (${primaryUrl})`);
  }
  if (mainDoc && !officialHost) officialHost = hostname(mainDoc.url);
  const docs: FirecrawlDocument[] = [];
  const covered = new Set<SubPageCategory>();
  const catDocs = new Map<SubPageCategory, FirecrawlDocument>();
  if (mainDoc) {
    (mainDoc as any)._category = "overview";
    docs.push(mainDoc);
    covered.add("overview" as SubPageCategory);
  }

  // ---------- STEP 2: categorize + scrape sub-pages from main page links ----------
  const linkPool: Array<{ url: string; category: SubPageCategory }> = [];
  const seenUrls = new Set<string>(docs.map((d) => normalizeUrl(d.url)));
  const rejectedLinks: string[] = [];
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
      if (isWrongProgramPage(norm, programName)) {
        rejectedLinks.push(norm);
        continue;
      }
      const cat = categorizeUrl(norm);
      if (!cat) continue;
      linkPool.push({ url: norm, category: cat });
    }
  }
  console.log(
    `enrich-university req=${requestId}: Step 2 rejected ${rejectedLinks.length} wrong-program/level links (undergrad/phd/other-MBA-variant). Sample: ${rejectedLinks.slice(0, 5).join(", ")}${rejectedLinks.length > 5 ? ` ... +${rejectedLinks.length - 5} more` : ""}`,
  );

  // Pick a single link per category to avoid over-scraping. A second link is
  // only added later in the gap-fill pass when the first came back thin.
  const perCat = new Map<SubPageCategory, string[]>();
  for (const item of linkPool) {
    const arr = perCat.get(item.category) ?? [];
    if (arr.length < 1) arr.push(item.url);
    perCat.set(item.category, arr);
  }
  const subPageUrls: Array<{ url: string; category: SubPageCategory }> = [];
  for (const [cat, urls] of perCat) {
    for (const url of urls) subPageUrls.push({ url, category: cat });
  }

  const step2Docs = await scrapeMany(
    subPageUrls.map((x) => x.url),
    Math.min(subPageUrls.length, TARGET_CATEGORIES.length),
    { concurrency: 6, maxMarkdownChars: 75000 },
    "step2-scrape-subpages",
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
      catDocs.set(cat, d);
    }
    console.log(
      `enrich-university req=${requestId}: doc added — url=${key} computed_category="${
        categorizeUrl(d.url) ?? "overview"
      }" satisfying_search_category="n/a (Step 2 discovery)"`,
    );
    docs.push(d);
  }

  // ---------- STEP 3: fill missing / thin categories via targeted search + rankings ----------
  // A category needs gap-fill if not covered, or if the single page we got is
  // clearly thin (< 500 markdown chars).
  const needsFill = TARGET_CATEGORIES.filter((c) => {
    if (!covered.has(c)) return true;
    const d = catDocs.get(c);
    return !!d && (d.markdown?.length ?? 0) < 500;
  });
  const catQueries: Partial<Record<SubPageCategory, string>> = {
    overview: `${programName} overview`,
    admissions: `${programName} admissions how to apply`,
    tuition: `${programName} tuition fees cost per credit`,
    funding: `${programName} scholarships assistantship financial aid stipend`,
    class_profile: `${programName} class profile student statistics average GMAT GPA`,
    career: `${programName} employment report career outcomes placement salary employers`,
  };
  // Only admissions content reliably lives under the program's admissions path;
  // tuition/funding/class profile/career usually live in sibling paths.
  // Admissions stays path-scoped regardless of mode. The other categories are
  // A/B-switchable between domain-scoped and open-web search via
  // GAP_FILL_SEARCH_MODE ("domain" default | "open").
  const searchMode = (Deno.env.get("GAP_FILL_SEARCH_MODE") ?? "domain") as "domain" | "open";
  const nonAdmissionsScope: "domain" | "open" = searchMode === "open" ? "open" : "domain";
  const categoryScopeMode: Partial<Record<SubPageCategory, "path" | "domain" | "open">> = {
    admissions: "path",
    tuition: nonAdmissionsScope,
    funding: nonAdmissionsScope,
    class_profile: nonAdmissionsScope,
    career: nonAdmissionsScope,
  };
  console.log(`enrich-university req=${requestId}: gap-fill searchMode=${searchMode}`);

  const seenQueries = new Set<string>();
  const gapPlans: Array<{ cat: SubPageCategory; query: string; scopeMode: "path" | "domain" | "open" }> = [];
  for (const cat of needsFill) {
    const base = catQueries[cat] ?? `${programName} ${cat}`;
    const scopeMode = categoryScopeMode[cat] ?? "domain";
    let query: string;
    let usedScope: "path" | "domain" | "open";
    if (scopeMode === "path" && programPathPrefix && officialHost) {
      query = `site:${officialHost}${programPathPrefix} ${base}`;
      usedScope = "path";
    } else if (scopeMode !== "open" && officialHost) {
      query = `site:${officialHost} ${base}`;
      usedScope = "domain";
    } else {
      query = `${universityName} ${base}`;
      usedScope = "open";
    }
    query = query.trim();
    if (seenQueries.has(query)) continue;
    seenQueries.add(query);
    console.log(
      `enrich-university req=${requestId}: mode=${searchMode} category=${cat} scope=${usedScope} query='${query}'`,
    );
    gapPlans.push({ cat, query, scopeMode: usedScope });
  }

  const gapBatches = await Promise.all(
    gapPlans.map((p) =>
      search(p.query, { limit: 1, scrapeOptions: { formats: ["markdown", "links"] } }, `step3-search-${p.cat}`),
    ),
  );
  const gapUrls: string[] = [];
  const gapUrlToCat = new Map<string, string>();
  for (let i = 0; i < gapBatches.length; i++) {
    const results = gapBatches[i];
    const plan = gapPlans[i];
    const scored = results
      .filter((r) => plan.scopeMode === "open" || isSameOrSubDomain(r.url, officialHost))
      .filter((r) => {
        if (isWrongProgramPage(r.url, programName)) {
          console.log(`enrich-university req=${requestId}: reject gap result (wrong program/level) ${r.url}`);
          return false;
        }
        return true;
      })
      .map((r) => ({ r, score: resultScore(r, officialHost, programName, plan.scopeMode) }))
      .sort((a, b) => b.score - a.score);
    console.log(
      `enrich-university req=${requestId}: category=${plan.cat} ALL CANDIDATES (ranked) — ${
        scored.map((s) => `${s.r.url}[${s.score}]`).join(", ") || "none"
      }`,
    );
    const top = scored.slice(0, 2).map((s) => s.r);
    console.log(
      `enrich-university req=${requestId}: mode=${searchMode} category=${plan.cat} scope=${plan.scopeMode} query='${plan.query}' → resolved: ${
        top.map((t) => t.url).join(", ") || "none"
      }`,
    );
    for (const t of top) {
      const norm = normalizeUrl(t.url);
      if (seenUrls.has(norm)) {
        const existingDoc = docs.find((d) => normalizeUrl(d.url) === norm);
        if (existingDoc) {
          const existingCat = (existingDoc as any)._category;
          if (!(existingDoc as any)._categories) {
            (existingDoc as any)._categories = new Set([existingCat]);
          }
          (existingDoc as any)._categories.add(plan.cat);
          console.log(
            `enrich-university req=${requestId}: category=${plan.cat} url=${norm} — already fetched under category="${existingCat}", also tagging as "${plan.cat}" (page covers both)`,
          );
        }
        continue;
      }
      // Reuse: if search already returned markdown, construct the doc directly
      // instead of paying for a second scrape.
      if (t.markdown && t.markdown.trim().length > 200) {
        seenUrls.add(norm);
        console.log(
          `enrich-university req=${requestId}: category=${plan.cat} url=${norm} — used inline search markdown, length=${t.markdown.trim().length}`,
        );
        console.log(
          `enrich-university req=${requestId}: doc added — url=${norm} computed_category="${
            categorizeUrl(norm) ?? "overview"
          }" satisfying_search_category="${plan.cat}"`,
        );
        const doc: FirecrawlDocument = {
          url: norm,
          title: t.title ?? "",
          description: t.description ?? "",
          markdown: t.markdown.slice(0, 75000),
          statusCode: t.statusCode ?? null,
          links: [],
        };
        (doc as any)._category = categorizeUrl(norm) ?? "overview";
        (doc as any)._categories = new Set([(doc as any)._category]);
        docs.push(doc);
      } else {
        console.log(
          `enrich-university req=${requestId}: category=${plan.cat} url=${norm} — inline markdown too short (${
            t.markdown?.trim().length ?? 0
          } chars), queuing separate scrape`,
        );
        gapUrls.push(norm);
        gapUrlToCat.set(norm, plan.cat);
      }
    }
  }
  const step3Docs = await scrapeMany(
    gapUrls,
    Math.min(gapUrls.length, 6),
    { concurrency: 5, maxMarkdownChars: 75000 },
    "step3-scrape-gapUrls",
  );
  for (const url of gapUrls) {
    const found = step3Docs.find((d) => normalizeUrl(d.url) === url);
    if (found) {
      console.log(
        `enrich-university req=${requestId}: gap-fill scrape SUCCESS url=${url} length=${found.markdown.length}`,
      );
    } else {
      console.log(
        `enrich-university req=${requestId}: gap-fill scrape FAILED or DROPPED url=${url} — check budget or scrape error`,
      );
    }
  }
  for (const d of step3Docs) {
    const key = normalizeUrl(d.url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    (d as any)._category = categorizeUrl(d.url) ?? "overview";
    (d as any)._categories = new Set([(d as any)._category]);
    console.log(
      `enrich-university req=${requestId}: doc added — url=${key} computed_category="${
        (d as any)._category
      }" satisfying_search_category="${gapUrlToCat.get(key) ?? "n/a (Step 3 scrape)"}"`,
    );
    docs.push(d);
  }

  // Prioritize: official host first, then category diversity.
  const officialDocs = docs.filter((d) => officialHost && d.url.toLowerCase().includes(officialHost.toLowerCase()));
  const otherDocs = docs.filter((d) => !officialHost || !d.url.toLowerCase().includes(officialHost.toLowerCase()));
  const finalDocs = [...officialDocs, ...otherDocs].slice(0, 20);
  // Step-3-first ordering: gap-fill docs move to the front so any residual
  // totalCap truncation cuts the least-important content first. Same docs,
  // different sequence only.
  const step3Urls = new Set(step3Docs.map((d) => normalizeUrl(d.url)));
  const gapFillDocs = finalDocs.filter((d) => step3Urls.has(normalizeUrl(d.url)));
  const remainingDocs = finalDocs.filter((d) => !step3Urls.has(normalizeUrl(d.url)));
  const orderedDocs = [...gapFillDocs, ...remainingDocs];
  const manifest = TARGET_CATEGORIES.map((cat) => {
    const matchingDocs = orderedDocs.filter((d) => (d as any)._categories?.has(cat) ?? (d as any)._category === cat);
    if (matchingDocs.length === 0) return `${cat}: NONE`;
    return `${cat}: ${matchingDocs.map((d) => `${d.url} (${d.markdown.length}chars)`).join(" | ")}`;
  }).join("\n  ");
  console.log(`enrich-university req=${requestId}: CATEGORY MANIFEST\n  ${manifest}`);
  console.log(
    `enrich-university req=${requestId}: gatherLiveSources done — firecrawl_ops=${opsBudget.count}/${MAX_TOTAL_FIRECRAWL_OPS}, docs=${orderedDocs.length} (gap-fill first: ${gapFillDocs.length})`,
  );
  return { docs: orderedDocs, mainDoc, officialHost };
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

  const requestId = crypto.randomUUID();
  const startedMs = Date.now();
  let lockedProgramId: string | null = null;
  let meteredUserId: string | null = null;
  let meteredColumn: string | null = null;
  let meteredNextValue = 0;

  try {
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { program_id, university_name, program_name, force, environment } = await req.json();
    if (!program_id || !university_name || !program_name)
      throw new Error("program_id, university_name, program_name required");

    console.log(`enrich-university: START req=${requestId} program_id=${program_id}`);

    // Resolve the requesting user's identity whenever a valid Authorization
    // header is present — independent of force. This does NOT enforce any
    // usage limit; it only identifies who is asking, so features like the fit
    // rationale can be personalized on every trigger (auto or manual).
    const authToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (authToken) {
      const { data: authedUserData } = await admin.auth.getUser(authToken);
      if (authedUserData?.user) {
        meteredUserId = authedUserData.user.id;
      }
    }

    // Manual "Update Data" runs are additionally metered per tier.
    if (force) {
      const env = parseEnv(environment);
      if (!meteredUserId) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "content-type": "application/json" },
        });
      }
      let { data: profile } = await admin.from("profiles").select("*").eq("id", meteredUserId).maybeSingle();
      if (!profile) throw new Error("profile missing");
      profile = await ensureUsageWindow(admin, profile, env);
      const paid = isPaid(profile, env);
      const view = envView(profile, env);
      const runsLimit = paid ? PAID_LIMITS.update_data_runs : FREE_LIMITS.update_data_runs;
      if ((view.updateDataUsed ?? 0) >= runsLimit) {
        const code = paid ? "update_data_limit_reached_paid" : "update_data_limit_reached";
        const msg = paid
          ? `You've used all ${PAID_LIMITS.update_data_runs} data updates for this billing period.`
          : "Data updates are a Pro feature.";
        return new Response(
          JSON.stringify({ ok: false, code, reason: "update_data_limit_reached", error: msg, resets_at: view.resetAt }),
          { status: 403, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
        );
      }
      meteredColumn = envColumns(env).updateDataUsed;
      meteredNextValue = (view.updateDataUsed ?? 0) + 1;
    }

    // Cheap pre-check for recently_enriched (does not need atomicity — the
    // atomic conditional UPDATE below handles concurrent lock acquisition).
    const { data: preCheck } = await admin
      .from("programs")
      .select("last_verified_at")
      .eq("id", program_id)
      .maybeSingle();
    if (preCheck?.last_verified_at) {
      const ageMs = Date.now() - new Date(preCheck.last_verified_at).getTime();
      if (ageMs >= 0 && ageMs < 5 * 60 * 1000) {
        console.log(`enrich-university: SKIP recently_enriched req=${requestId} program_id=${program_id}`);
        return new Response(JSON.stringify({ ok: true, skipped: "recently_enriched" }), {
          headers: { ...CORS_HEADERS, "content-type": "application/json" },
        });
      }
    }

    // Atomic lock acquisition: single conditional UPDATE that only matches
    // rows without a valid live lock. Postgres serializes concurrent UPDATEs
    // to the same row, so only the winner gets a non-empty select() back.
    const lockCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const { data: lockedRows, error: lockErr } = await admin
      .from("programs")
      .update({ enrichment_started_at: nowIso })
      .eq("id", program_id)
      .or(`enrichment_started_at.is.null,enrichment_started_at.lt.${lockCutoff}`)
      .select("id, last_verified_at, program_url");
    if (lockErr) {
      console.error(`enrich-university: lock acquisition error req=${requestId}`, lockErr);
      throw lockErr;
    }
    if (!lockedRows || lockedRows.length === 0) {
      console.log(
        `enrich-university: SKIP enrichment_in_progress req=${requestId} program_id=${program_id} — lock held by another request`,
      );
      return new Response(JSON.stringify({ ok: true, skipped: "enrichment_in_progress" }), {
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }
    const existing = lockedRows[0];
    lockedProgramId = program_id;

    // Prefer the specific program URL resolved during discovery; fall back to
    // the university website URL from the request payload or the row.
    const storedProgramUrl = (existing as any)?.program_url ?? null;
    let gathered;
    try {
      gathered = await gatherLiveSources(university_name, program_name, null, storedProgramUrl, requestId);
    } catch (e) {
      console.error(`enrich-university req=${requestId}: gatherLiveSources THREW — ${(e as Error).message}`);
      throw e;
    }
    const docs = gathered.docs;
    if (docs.length === 0) {
      throw new Error("No live university sources could be found or scraped. Please retry later.");
    }
    const validSources = new Set(docs.map((doc) => normalizeUrl(doc.url)));

    const assembledContext = sourceContext(docs);
    const truncatedDocCount = docs.filter((d) => d.truncated).length;
    console.log(
      `enrich-university req=${requestId}: context assembled — ${docs.length} docs, ${truncatedDocCount} truncated at scrape layer, final context length ${assembledContext.length}/${SOURCE_CONTEXT_TOTAL_CAP}`,
    );
    const categoryContentSummary = TARGET_CATEGORIES.map((cat) => {
      const catDocsForSummary = docs.filter((d) => (d as any)._categories?.has(cat) ?? (d as any)._category === cat);
      const totalChars = catDocsForSummary.reduce((sum, d) => sum + d.markdown.length, 0);
      return `${cat}=${catDocsForSummary.length}doc(s)/${totalChars}chars`;
    }).join(", ");
    console.log(`enrich-university req=${requestId}: pre-Gemini category summary — ${categoryContentSummary}`);

    const system =
      "You are a graduate admissions data extraction specialist. You have been given content scraped from multiple pages of a university's official website. Your job is to find and extract every piece of admissions data present in the content.\n\nEXTRACTION RULES:\n- Be aggressive, not conservative. If the data is in the content in ANY form, extract it. Do not return null just because the format is unusual or the label is different from what you expected.\n- University websites use many different labels for the same field. You must recognize all of them. Examples below.\n- If a field is genuinely absent from all content, use null. But err on the side of extracting rather than skipping.\n- Never fabricate values. Only extract what is in the content.\n- TUITION: always prefer the non-resident / out-of-state / international student tuition rate. Only if no such rate is published anywhere in the content, fall back to the in-state / resident rate. Never average or blend the two, and never sum them. Always state which rate was used in tuition_note (e.g. 'out-of-state', 'international', or 'in-state — only rate published').\n- When a value appears as a range (e.g. '310-330'), store the range string in the corresponding _range field and leave the numeric field null. Do not compute midpoints or averages from ranges.\n- When a value appears as 'average', 'median', or 'middle 80%' — extract whichever is available, preferring average, then median.\n- For GRE: never average or calculate. If the website publishes a range like '310-330', store it as a string in the _range field and leave the number field null. If it publishes a single average like '318', store it as a number and leave the _range field null. Both can be populated if the website provides both. Extract composite (gre_total), quant (gre_quant), and verbal (gre_verbal) independently — whichever the site publishes.\n\nFor test requirements, look for these label variations and map them to the correct field:\nGRE labels: GRE, GRE Score, GRE Requirement, Graduate Record Examination, GRE General Test, GRE Waiver, GRE Optional, GRE Required\nGMAT labels: GMAT, GMAT Score, GMAT Requirement, Graduate Management Admission Test, GMAT Waiver, GMAT Optional, GMAT Required, GMAT Focus\nAlso look for combined statements like:\n- 'GRE/GMAT optional' → set both to 'optional'\n- 'GRE or GMAT required' → set both to 'required'\n- 'GMAT required, GRE not accepted' → gmat: required, gre: not_required\n- 'Test scores not required' → set both to 'not_required'\n- 'GRE waived for applicants with X' → gre: 'waived', put condition in gre_gmat_notes\n- 'No GRE/GMAT required' → both: 'not_required'\n- 'GRE optional, GMAT not accepted' → gre: optional, gmat: not_required\nFor gre_gmat_notes: capture any important conditions such as waiver criteria, minimum score requirements, or exceptions (e.g. 'GRE waived for applicants with 2+ years work experience', 'GMAT required for applicants without a quantitative undergraduate background').\nIf test requirement information is completely absent from all scraped content, return null for both fields — do not guess.\n\nThe bracketed label next to each source (e.g. [admissions] or [class_profile/admissions]) only indicates where the page was discovered during research — it is NOT a restriction on what you may extract from it. A single page often contains information relevant to multiple sections of the output schema (for example, an admissions page may also contain class profile statistics like GMAT/GPA/class size, or a tuition page may also contain funding and scholarship details). Read the full content of every source and extract every relevant fact into its correct schema section, regardless of which category label the source was tagged with.";

    const user = `Research this master's program using ONLY the live scraped source content below:
University: ${university_name}
Program: ${program_name}

LIVE SOURCES:
${assembledContext}

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
    "tuition_amount": number or null,  // PREFER non-resident / out-of-state / international tuition; only if none is published, use in-state / resident tuition
    "tuition_note": string or null,    // MUST state which rate this is, e.g. "out-of-state" / "international" / "in-state (only rate published)"
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

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 64000 });
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

    // Fallback-only deadline extraction: only run when the main pass found
    // nothing. Reuses already-scraped docs — zero additional Firecrawl calls.
    const mainDeadlinesArr = Array.isArray(ad.deadlines) ? ad.deadlines : [];
    const mainDeadlineType = ad.deadline_type ?? "tbd";
    let deadlineResult = {
      deadline_type: mainDeadlineType as "fixed" | "rolling" | "tbd",
      deadlines: mainDeadlinesArr,
      raw_deadline_text: "",
    };
    if (mainDeadlinesArr.length === 0 && mainDeadlineType === "tbd") {
      deadlineResult = await extractDeadlines({
        apiKey,
        universityName: university_name,
        programName: program_name,
        targetIntake: null,
        deadlineContext: "",
        fallbackContext: sourceContext(docs, 40000, 120000),
      });
    }

    const verifiedSources = Array.isArray(data.sources)
      ? data.sources
          .map((url: unknown) => validUrlOrNull(url, validSources))
          .filter((url: string | null): url is string => !!url)
      : [];
    const fallbackSources =
      verifiedSources.length > 0 ? verifiedSources : docs.slice(0, 5).map((doc) => normalizeUrl(doc.url));

    await admin
      .from("programs")
      .update({
        program_description: ov.program_description ?? null,
        us_news_ranking: ov.us_news_ranking ?? null,
        school_ranking: ov.qs_ranking ?? null,
        apply_url: validUrlOrNull(ad.apply_url, validSources),
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", program_id);

    const finalDeadlines = deadlineResult.deadlines;
    const finalDeadlineType = deadlineResult.deadline_type;

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

    if (meteredUserId && meteredColumn) {
      await admin
        .from("profiles")
        .update({ [meteredColumn]: meteredNextValue })
        .eq("id", meteredUserId);
    }

    // ---- Personalized fit rationale (triggering user only) ----
    try {
      if (!meteredUserId) {
        console.log(
          `enrich-university req=${requestId}: no authenticated user on this request — skipping fit rationale`,
        );
      } else {
        const { data: triggeringEntry } = await admin
          .from("user_entries")
          .select("id")
          .eq("program_id", program_id)
          .eq("user_id", meteredUserId)
          .maybeSingle();

        if (!triggeringEntry) {
          console.log(
            `enrich-university req=${requestId}: triggering user has no user_entries row for this program — skipping fit rationale`,
          );
        } else {
          const fieldSummary = `
Program: ${program_name} at ${university_name}
Description: ${ov.program_description ?? "not available"}
QS Ranking: ${ov.qs_ranking ?? "not available"}, US News: ${ov.us_news_ranking ?? "not available"}
Deadline type: ${finalDeadlineType}, next deadline: ${finalDeadlines?.[0]?.deadline_date ?? "not available"}
GRE/GMAT requirement: GRE ${ad.gre_required ?? "unknown"}, GMAT ${ad.gmat_required ?? "unknown"}
Class profile: avg GMAT ${cp.avg_gmat ?? cp.gre_total ?? "not available"}, avg GPA ${cp.avg_gpa ?? "not available"}, class size ${cp.class_size ?? "not available"}, international % ${cp.intl_student_pct ?? "not available"}, STEM: ${cp.is_stem ?? "unknown"}
Tuition: ${tf.tuition_amount ?? "not available"} ${tf.tuition_currency ?? ""} per ${tf.tuition_per ?? "unspecified period"}
Funding: GA/TA available: ${tf.ga_ta_gra_available ?? "unknown"}, notes: ${tf.ga_ta_gra_notes ?? "none"}
Career outcomes: placement rate ${co.placement_rate_pct ?? "not available"}%, avg salary ${co.avg_salary ?? "not available"} ${co.avg_salary_currency ?? ""}, top employers: ${(co.top_employers ?? []).slice(0, 3).join(", ") || "not available"}
          `.trim();

          const { data: profile } = await admin
            .from("profiles")
            .select(
              "target_major, target_country, target_tier, funding_preference, gpa, test_scores, work_exp_years, target_intake",
            )
            .eq("id", meteredUserId)
            .maybeSingle();

          if (profile) {
            const ts = (profile.test_scores ?? {}) as Record<string, string>;
            const testStr =
              ["gre", "gmat", "ielts", "toefl"]
                .map((t) => (ts[t] ? `${t.toUpperCase()}: ${ts[t]}` : null))
                .filter(Boolean)
                .join(", ") || "not provided";

            const userPrefsSummary = `
Target major: ${profile.target_major ?? "unspecified"}
Target country: ${profile.target_country ?? "any"}
Tier preference: ${profile.target_tier ?? "unspecified"}
Funding preference: ${profile.funding_preference ?? "unspecified"}
GPA: ${profile.gpa ?? "not provided"}
Test scores: ${testStr}
Work experience: ${profile.work_exp_years ?? 0} years
Target intake: ${profile.target_intake ?? "unspecified"}
            `.trim();

            const fitSystem =
              "You write short, factual fit assessments for a graduate school applicant comparing their profile against a specific program's actual admissions data. Be precise and concrete — reference specific numbers from the program data when relevant (deadlines, class profile averages, tuition, outcomes). Do not use generic praise or vague phrases like 'great fit' or 'strong program' without a specific reason tied to the data provided. If the program's data doesn't clearly support a strength or gap, don't invent one. Write exactly 1-2 complete sentences, under 300 characters total. Never leave a sentence unfinished — if you are running out of room, write one shorter complete sentence instead of a longer incomplete one.";
            const fitUser = `Program data:\n${fieldSummary}\n\nApplicant profile:\n${userPrefsSummary}\n\nWrite a short, specific fit rationale (max 2 sentences) explaining how well this program matches this applicant, grounded only in the data above.`;

            try {
              const rationale = await callLovableAI({ apiKey, system: fitSystem, user: fitUser, maxTokens: 2000 });
              const cleaned = rationale.trim().replace(/^["']|["']$/g, "");
              const endsCleanly = /[.!?]$/.test(cleaned);
              if (!endsCleanly) {
                console.warn(
                  `enrich-university req=${requestId}: fit rationale looks truncated (no terminal punctuation), not saving — "${cleaned}"`,
                );
              } else {
                await admin.from("user_entries").update({ match_rationale: cleaned }).eq("id", triggeringEntry.id);
                console.log(
                  `enrich-university req=${requestId}: fit rationale regenerated for triggering user ${meteredUserId}`,
                );
              }
            } catch (e) {
              console.warn(`enrich-university req=${requestId}: fit rationale generation failed`, (e as Error).message);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`enrich-university req=${requestId}: fit rationale step failed`, (e as Error).message);
    }

    return new Response(
      JSON.stringify({ ok: true, sources_checked: docs.length, sources_saved: fallbackSources.length }),
      {
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      },
    );
  } catch (e) {
    console.error(`enrich-university req=${requestId}: error`, e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } finally {
    if (lockedProgramId) {
      try {
        await admin.from("programs").update({ enrichment_started_at: null }).eq("id", lockedProgramId);
      } catch (e) {
        console.warn(`enrich-university: failed to clear lock req=${requestId}`, (e as Error).message);
      }
    }
    console.log(`enrich-university: END req=${requestId} elapsed_ms=${Date.now() - startedMs}`);
  }
});
