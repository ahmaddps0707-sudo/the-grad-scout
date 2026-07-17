// Tavily web search + URL extraction helpers.
// Docs: https://docs.tavily.com/

const TAVILY_API = "https://api.tavily.com";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

export interface TavilySearchResponse {
  answer?: string;
  results: TavilySearchResult[];
}

export async function tavilySearch(opts: {
  apiKey: string;
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
  includeAnswer?: boolean;
  topic?: "general" | "news";
}): Promise<TavilySearchResponse> {
  const res = await fetch(`${TAVILY_API}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      query: opts.query,
      max_results: opts.maxResults ?? 6,
      search_depth: opts.searchDepth ?? "advanced",
      include_answer: opts.includeAnswer ?? false,
      include_domains: opts.includeDomains,
      exclude_domains: opts.excludeDomains,
      topic: opts.topic ?? "general",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily search ${res.status}: ${t}`);
  }
  return await res.json();
}

export interface TavilyExtractResult {
  url: string;
  raw_content: string;
}

export async function tavilyExtract(opts: {
  apiKey: string;
  urls: string[];
  extractDepth?: "basic" | "advanced";
}): Promise<{ results: TavilyExtractResult[]; failed_results?: Array<{ url: string; error: string }> }> {
  const res = await fetch(`${TAVILY_API}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      urls: opts.urls,
      extract_depth: opts.extractDepth ?? "basic",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily extract ${res.status}: ${t}`);
  }
  return await res.json();
}

/**
 * Format search results into a compact context block for LLM grounding.
 * Truncates each snippet to keep prompt size reasonable.
 */
export function formatSearchContext(results: TavilySearchResult[], perSnippetChars = 800): string {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${(r.content ?? "").slice(0, perSnippetChars)}`)
    .join("\n\n---\n\n");
}

export function formatExtractContext(results: TavilyExtractResult[], perDocChars = 4000): string {
  return results
    .map((r, i) => `[Source ${i + 1}] ${r.url}\n${(r.raw_content ?? "").slice(0, perDocChars)}`)
    .join("\n\n---\n\n");
}

export function getTavilyKeyOrThrow(): string {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) throw new Error("TAVILY_API_KEY not configured");
  return key;
}