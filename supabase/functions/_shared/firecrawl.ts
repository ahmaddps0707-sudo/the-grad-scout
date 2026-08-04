// deno-lint-ignore-file no-explicit-any
export interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
  statusCode?: number | null;
}

export interface FirecrawlDocument extends FirecrawlResult {
  markdown: string;
  statusCode?: number | null;
  links?: string[];
  truncated?: boolean;
}

const FIRECRAWL_API_V2 = "https://api.firecrawl.dev/v2";

function parseRetryAfterMs(body: string, headers: Headers): number {
  const h = headers.get("retry-after");
  if (h) {
    const n = Number(h);
    if (!isNaN(n)) return Math.min(15000, Math.max(500, n * 1000));
  }
  const m = body.match(/retry after (\d+)s/i);
  if (m) return Math.min(15000, Math.max(500, Number(m[1]) * 1000));
  return 2000;
}

async function firecrawlFetch(path: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let attempt = 0;
  let timeouts = 0;
  while (true) {
    // Per-request wall-clock timeout so a single hung upstream call cannot
    // consume the edge function's 150s idle budget.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    let res: Response;
    try {
      res = await fetch(`${FIRECRAWL_API_V2}${path}`, { ...init, signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error)?.name === "AbortError") {
        console.warn(`firecrawl ${path} timed out after 25s`);
        if (timeouts < 1) {
          timeouts++;
          continue; // one retry — upstream hiccups are usually transient
        }
        return new Response("timeout", { status: 504, headers: { "x-firecrawl-timeout": "1" } });
      }
      throw e;
    }
    clearTimeout(timer);
    if (res.status !== 429 || attempt >= maxRetries) return res;
    const body = await res
      .clone()
      .text()
      .catch(() => "");
    const wait = parseRetryAfterMs(body, res.headers);
    await new Promise((r) => setTimeout(r, wait));
    attempt++;
  }
}

export class FirecrawlProviderError extends Error {
  code: "search_provider_out_of_credits" | "search_provider_error";
  status: number;
  constructor(status: number, body: string) {
    const code = status === 402 ? "search_provider_out_of_credits" : "search_provider_error";
    super(`${code}: ${status} ${body.slice(0, 200)}`);
    this.code = code;
    this.status = status;
  }
}

function firecrawlHeaders(): HeadersInit | null {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.error("firecrawl missing FIRECRAWL_API_KEY");
    return null;
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch (_e) {
    return String(url ?? "").trim();
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_e) {
    return false;
  }
}

function isDeadStatus(status?: number | null): boolean {
  return status === 404 || status === 410;
}

export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; scrapeOptions?: { formats?: string[] } } = {},
): Promise<FirecrawlResult[]> {
  const headers = firecrawlHeaders();
  if (!headers) return [];
  const body: any = { query, limit: opts.limit ?? 10 };
  if (opts.scrapeOptions) body.scrapeOptions = opts.scrapeOptions;
  const res = await firecrawlFetch(`/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("firecrawl search failed", res.status, body);
    // Local client-side timeout: soft failure, treated as "no results" so one
    // slow upstream call cannot abort the whole job.
    if (res.headers.get("x-firecrawl-timeout") === "1") return [];
    // Surface provider auth/credit/rate errors so the caller can fail the job
    // instead of masking as "zero results".
    if (res.status === 402 || res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      throw new FirecrawlProviderError(res.status, body);
    }
    return [];
  }
  try {
    const json: any = await res.json().catch(() => ({}));
    const data = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.web)
        ? json.data.web
        : Array.isArray(json?.web)
          ? json.web
          : [];
    return data
      .map((r: any) => ({
        url: String(r?.url ?? ""),
        title: r?.title ?? r?.metadata?.title ?? "",
        description: r?.description ?? r?.snippet ?? r?.metadata?.description ?? "",
        markdown: typeof r?.markdown === "string" ? r.markdown : undefined,
        statusCode: Number(r?.metadata?.statusCode ?? 0) || null,
      }))
      .filter((r: FirecrawlResult) => r.url);
  } catch (e) {
    console.error("firecrawl search parse error", e);
    return [];
  }
}

export async function firecrawlScrape(
  url: string,
  opts: { waitFor?: number; maxMarkdownChars?: number; includeLinks?: boolean } = {},
): Promise<FirecrawlDocument | null> {
  const headers = firecrawlHeaders();
  if (!headers) return null;
  const normalized = normalizeUrl(url);
  if (!isHttpUrl(normalized)) return null;
  try {
    const formats: any[] = ["markdown"];
    if (opts.includeLinks) formats.push("links");
    const res = await firecrawlFetch(`/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: normalized,
        formats,
        onlyMainContent: true,
        waitFor: opts.waitFor ?? 1000,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("firecrawl scrape failed", normalized, res.status, text.slice(0, 500));
      return null;
    }
    const json: any = JSON.parse(text || "{}");
    const payload = json?.data ?? json;
    const metadata = payload?.metadata ?? json?.metadata ?? {};
    const statusCode = Number(metadata?.statusCode ?? payload?.statusCode ?? 0) || null;
    if (isDeadStatus(statusCode)) {
      console.warn("firecrawl scrape dead link", normalized, statusCode);
      return null;
    }
    const markdown = String(payload?.markdown ?? json?.markdown ?? "").trim();
    if (!markdown) return null;
    const sourceURL = normalizeUrl(String(metadata?.sourceURL ?? payload?.url ?? normalized));
    const rawLinks: any[] = Array.isArray(payload?.links)
      ? payload.links
      : Array.isArray(json?.links)
        ? json.links
        : [];
    const links = rawLinks
      .map((l: any) => (typeof l === "string" ? l : (l?.url ?? l?.href ?? "")))
      .filter((l: string) => !!l);
    const cap = opts.maxMarkdownChars ?? 75000;
    const wasTruncated = markdown.length > cap;
    const slicedMarkdown =
      markdown.slice(0, cap) +
      (wasTruncated ? "\n\n[CONTENT TRUNCATED — additional content existed beyond this point]" : "");
    return {
      url: sourceURL,
      title: metadata?.title ?? payload?.title ?? "",
      description: metadata?.description ?? payload?.description ?? "",
      markdown: slicedMarkdown,
      statusCode,
      links,
      truncated: wasTruncated,
    };
  } catch (e) {
    console.error("firecrawl scrape error", normalized, e);
    return null;
  }
}

export async function scrapeUniqueUrls(
  urls: string[],
  limit = 10,
  opts: { concurrency?: number; includeLinks?: boolean; maxMarkdownChars?: number } = {},
): Promise<FirecrawlDocument[]> {
  const seen = new Set<string>();
  const unique = urls
    .map(normalizeUrl)
    .filter(isHttpUrl)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, limit);

  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const docs: FirecrawlDocument[] = [];
  let idx = 0;
  async function worker() {
    while (idx < unique.length) {
      const my = idx++;
      const doc = await firecrawlScrape(unique[my], {
        includeLinks: opts.includeLinks,
        maxMarkdownChars: opts.maxMarkdownChars,
      });
      if (doc) docs.push(doc);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return docs;
}

/**
 * Categorize a URL by keywords in the URL path / anchor text.
 * Returns null when no useful category.
 */
export type SubPageCategory =
  | "admissions"
  | "deadlines"
  | "requirements"
  | "tuition"
  | "funding"
  | "class_profile"
  | "career"
  | "international"
  | "overview";

const CATEGORY_PATTERNS: Array<{ cat: SubPageCategory; re: RegExp }> = [
  {
    cat: "admissions",
    re: /(admission|apply|application|how-to-apply|deadline|dates|timeline|requirement|prerequisite|eligibility|criteria)/i,
  },
  { cat: "tuition", re: /(tuition|cost|fees?|expenses|cost-of-attendance)/i },
  { cat: "funding", re: /(funding|scholarship|assistantship|financial-aid|fellowship|aid)/i },
  {
    cat: "class_profile",
    re: /(class-profile|profile|student-body|statistics|stats|demographics|incoming-class|gre|gmat|gpa|class-size|test-scores|work-experience)/i,
  },
  { cat: "career", re: /(career|employment|outcome|placement|salary|jobs|employers|career-services)/i },
];

export function categorizeUrl(url: string): SubPageCategory | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  const lastSegment = path.split("/").filter(Boolean).pop() ?? "";

  const SPECIFIC_FIRST: Array<{ cat: SubPageCategory; re: RegExp }> = [
    {
      cat: "class_profile",
      re: /(class-profile|statistics|stats|demographics|incoming-class|gre|gmat|gpa|class-size|test-scores|work-experience)/i,
    },
    { cat: "career", re: /(career|employment|outcome|placement|salary|jobs|employers|career-services)/i },
    { cat: "funding", re: /(funding|scholarship|assistantship|financial-aid|fellowship|aid)/i },
    { cat: "tuition", re: /(tuition|cost|fees?|expenses|cost-of-attendance)/i },
  ];

  for (const { cat, re } of SPECIFIC_FIRST) {
    if (re.test(lastSegment)) return cat;
  }

  const lower = url.toLowerCase();
  for (const { cat, re } of SPECIFIC_FIRST) {
    if (re.test(lower)) return cat;
  }

  if (
    /(admission|apply|application|how-to-apply|deadline|dates|timeline|requirement|prerequisite|eligibility|criteria)/i.test(
      lower,
    )
  ) {
    return "admissions";
  }

  if (
    /(gre|gmat|gpa|class-size|class_size|years-of-experience|work-experience|test-scores|average-scores)/i.test(lower)
  ) {
    return "class_profile";
  }

  return null;
}

/** Same host or subdomain of official host. */
export function isSameOrSubDomain(url: string, officialHost: string | null): boolean {
  if (!officialHost) return true;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const off = officialHost.toLowerCase().replace(/^www\./, "");
    return host === off || host.endsWith("." + off);
  } catch {
    return false;
  }
}

export function concatSnippets(results: FirecrawlResult[]): string {
  return results.map((r) => `URL: ${r.url}\nTitle: ${r.title ?? ""}\nSnippet: ${r.description ?? ""}`).join("\n---\n");
}
