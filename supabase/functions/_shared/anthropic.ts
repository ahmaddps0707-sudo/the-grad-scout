// Shared helpers for Anthropic web-search calls.

export const ANTHROPIC_MODEL = "claude-sonnet-4-5";

export interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
}

export function extractFinalText(resp: AnthropicResponse): string {
  // Iterate content blocks; return the last `text` block's text.
  let text = "";
  for (const block of resp.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      text = block.text;
    }
  }
  return text;
}

export function stripFences(raw: string): string {
  let s = raw.trim();
  // Remove leading ```json or ```
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

export async function callAnthropic(opts: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  maxWebSearches?: number;
}): Promise<AnthropicResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: opts.maxWebSearches ?? 5 },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t}`);
  }
  return (await res.json()) as AnthropicResponse;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};