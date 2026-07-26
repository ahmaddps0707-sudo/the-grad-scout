// deno-lint-ignore-file no-explicit-any
export interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
}

export interface FirecrawlDocument extends FirecrawlResult {
  markdown: string;
  statusCode?: number | null;
  links?: string[];
}

const FIRECRAWL_GATEWAY_V2 = "https://connector-gateway.lovable.dev/firecrawl/v2";

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
  const connKey = Deno.env.get("FIRECRAWL_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!connKey || !lovableKey) {
    console.error("firecrawl missing keys", { hasConn: !!connKey, hasLovable: !!lovableKey });
    return null;
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${lovableKey}`,
    "x-connection-api-key": connKey,
  };
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
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
  opts: { limit?: number } = {},
): Promise<FirecrawlResult[]> {
  const headers = firecrawlHeaders();
  if (!headers) return [];
  const res = await fetch(`${FIRECRAWL_GATEWAY_V2}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit: opts.limit ?? 10 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("firecrawl search failed", res.status, body);
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
    const res = await fetch(`${FIRECRAWL_GATEWAY_V2}/scrape`, {
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
    const rawLinks: any[] = Array.isArray(payload?.links) ? payload.links : Array.isArray(json?.links) ? json.links : [];
    const links = rawLinks
      .map((l: any) => (typeof l === "string" ? l : l?.url ?? l?.href ?? ""))
      .filter((l: string) => !!l);
    return {
      url: sourceURL,
      title: metadata?.title ?? payload?.title ?? "",
      description: metadata?.description ?? payload?.description ?? "",
      markdown: markdown.slice(0, opts.maxMarkdownChars ?? 12000),
      statusCode,
      links,
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
  | "curriculum"
  | "international"
  | "faculty"
  | "overview";

const CATEGORY_PATTERNS: Array<{ cat: SubPageCategory; re: RegExp }> = [
  { cat: "admissions", re: /(admission|apply|application|how-to-apply)/i },
  { cat: "deadlines", re: /(deadline|dates|timeline|calendar)/i },
  { cat: "requirements", re: /(requirement|prerequisite|eligibility|criteria|gre|gmat|toefl|ielts)/i },
  { cat: "tuition", re: /(tuition|cost|fees?|price|expenses|cost-of-attendance)/i },
  { cat: "funding", re: /(funding|scholarship|assistantship|financial-aid|fellowship|aid)/i },
  { cat: "class_profile", re: /(class-profile|profile|student-body|statistics|stats|demographics|incoming-class)/i },
  { cat: "career", re: /(career|employment|outcome|placement|salary|jobs|employers|career-services)/i },
  { cat: "curriculum", re: /(curriculum|courses?|course-list|program-structure|electives|specializations?|tracks?|concentration)/i },
  { cat: "international", re: /(international|visa|i-20|stem|opt|cpt)/i },
  { cat: "faculty", re: /(faculty|professors?|research|people)/i },
];

export function categorizeUrl(url: string): SubPageCategory | null {
  const lower = url.toLowerCase();
  for (const { cat, re } of CATEGORY_PATTERNS) {
    if (re.test(lower)) return cat;
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
  return results
    .map((r) => `URL: ${r.url}\nTitle: ${r.title ?? ""}\nSnippet: ${r.description ?? ""}`)
    .join("\n---\n");
}