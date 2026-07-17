// deno-lint-ignore-file no-explicit-any
export interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
}

export interface FirecrawlDocument extends FirecrawlResult {
  markdown: string;
  statusCode?: number | null;
}

const FIRECRAWL_GATEWAY_V2 = "https://connector-gateway.lovable.dev/firecrawl/v2";

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
  try {
    const res = await fetch(`${FIRECRAWL_GATEWAY_V2}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, limit: opts.limit ?? 10 }),
    });
    if (!res.ok) {
      console.error("firecrawl search failed", res.status, await res.text().catch(() => ""));
      return [];
    }
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
    console.error("firecrawl search error", e);
    return [];
  }
}

export async function firecrawlScrape(
  url: string,
  opts: { waitFor?: number; maxMarkdownChars?: number } = {},
): Promise<FirecrawlDocument | null> {
  const headers = firecrawlHeaders();
  if (!headers) return null;
  const normalized = normalizeUrl(url);
  if (!isHttpUrl(normalized)) return null;
  try {
    const res = await fetch(`${FIRECRAWL_GATEWAY_V2}/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: normalized,
        formats: ["markdown"],
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
    return {
      url: sourceURL,
      title: metadata?.title ?? payload?.title ?? "",
      description: metadata?.description ?? payload?.description ?? "",
      markdown: markdown.slice(0, opts.maxMarkdownChars ?? 12000),
      statusCode,
    };
  } catch (e) {
    console.error("firecrawl scrape error", normalized, e);
    return null;
  }
}

export async function scrapeUniqueUrls(urls: string[], limit = 10): Promise<FirecrawlDocument[]> {
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

  const docs: FirecrawlDocument[] = [];
  for (const url of unique) {
    const doc = await firecrawlScrape(url);
    if (doc) docs.push(doc);
  }
  return docs;
}

export function concatSnippets(results: FirecrawlResult[]): string {
  return results
    .map((r) => `URL: ${r.url}\nTitle: ${r.title ?? ""}\nSnippet: ${r.description ?? ""}`)
    .join("\n---\n");
}