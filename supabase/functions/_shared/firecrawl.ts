// deno-lint-ignore-file no-explicit-any
export interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
}

export async function firecrawlSearch(
  query: string,
  opts: { limit?: number } = {},
): Promise<FirecrawlResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: opts.limit ?? 10 }),
    });
    if (!res.ok) {
      console.error("firecrawl search failed", res.status, await res.text().catch(() => ""));
      return [];
    }
    const json: any = await res.json().catch(() => ({}));
    const data = Array.isArray(json?.data) ? json.data : [];
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

export function concatSnippets(results: FirecrawlResult[]): string {
  return results
    .map((r) => `URL: ${r.url}\nTitle: ${r.title ?? ""}\nSnippet: ${r.description ?? ""}`)
    .join("\n---\n");
}