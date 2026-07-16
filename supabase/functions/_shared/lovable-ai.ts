// Shared helpers for Lovable AI Gateway (Gemini).

export const DEFAULT_MODEL = "google/gemini-3.5-flash";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function stripFences(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  s = s.trim();
  // Drop any prose before the first JSON token
  const firstBrace = s.search(/[\[{]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  return s.trim();
}

/**
 * Parse JSON from an LLM response, tolerating truncation and minor formatting issues.
 * If the response is truncated mid-array, recover by trimming back to the last complete
 * top-level element and closing the array.
 */
export function parseJsonLoose(raw: string): any {
  let s = stripFences(raw);
  // Strip control chars (except \n \r \t which JSON.parse handles in strings only via escapes)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // First attempt: as-is, with trailing-comma cleanup.
  const tryParse = (txt: string) => {
    const cleaned = txt.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(cleaned);
  };

  try { return tryParse(s); } catch { /* fall through */ }

  // Recovery for truncated arrays: find last "},\n" or "}\n" at depth 1 inside the array
  if (s.startsWith("[")) {
    // Walk the string tracking depth and string state; remember the index right after each
    // top-level element closes (depth returns to 1 after being deeper).
    let depth = 0;
    let inStr = false;
    let esc = false;
    let lastGoodEnd = -1; // index AFTER a complete top-level element
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 1) lastGoodEnd = i + 1; // closed a top-level element inside the outer array
        if (depth === 0) lastGoodEnd = i + 1; // closed the outer array
      }
    }
    if (lastGoodEnd > 0) {
      let recovered = s.slice(0, lastGoodEnd).trim();
      // Strip trailing comma if any
      recovered = recovered.replace(/,\s*$/, "");
      if (!recovered.endsWith("]")) recovered += "]";
      try { return tryParse(recovered); } catch { /* fall through */ }
    }
  }

  throw new Error("AI response was truncated or malformed JSON.");
}

export async function callLovableAI(opts: {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_completion_tokens: opts.maxTokens ?? 4096,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to your Lovable workspace.");
    throw new Error(`Lovable AI ${res.status}: ${t}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!content || !String(content).trim()) {
    throw new Error("AI returned empty content. Please retry.");
  }
  return content;
}