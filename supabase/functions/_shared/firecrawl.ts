// Shared Firecrawl helpers via Lovable connector gateway.

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

function headers() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!lovableKey || !fcKey) throw new Error("Firecrawl credentials not configured");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": fcKey,
  };
}

export interface FirecrawlSearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; scrape?: boolean } = {},
): Promise<FirecrawlSearchResult[]> {
  try {
    const body: Record<string, unknown> = { query, limit: opts.limit ?? 5 };
    if (opts.scrape) body.scrapeOptions = { formats: ["markdown"] };
    const res = await fetch(`${GATEWAY}/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`firecrawl search failed [${res.status}]`, await res.text());
      return [];
    }
    const json = await res.json();
    const items = json?.data ?? json?.web ?? [];
    if (!Array.isArray(items)) return [];
    return items.map((r: any) => ({
      url: r.url ?? "",
      title: r.title ?? "",
      description: r.description ?? r.snippet ?? "",
      markdown: r.markdown ?? "",
    }));
  } catch (e) {
    console.error("firecrawl search exception", e);
    return [];
  }
}

export async function firecrawlScrape(url: string): Promise<string> {
  try {
    const res = await fetch(`${GATEWAY}/scrape`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) {
      console.error(`firecrawl scrape failed [${res.status}]`, await res.text());
      return "";
    }
    const json = await res.json();
    return json?.data?.markdown ?? json?.markdown ?? "";
  } catch (e) {
    console.error("firecrawl scrape exception", e);
    return "";
  }
}

export function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

export function concatSearchMarkdown(results: FirecrawlSearchResult[]): string {
  return results
    .map((r) => `## ${r.title ?? r.url}\n${r.url}\n${r.description ?? ""}\n\n${r.markdown ?? ""}`)
    .join("\n\n---\n\n");
}

export function concatSnippets(results: FirecrawlSearchResult[]): string {
  return results
    .map((r) => `- ${r.title ?? ""} | ${r.url}\n  ${r.description ?? ""}`)
    .join("\n");
}