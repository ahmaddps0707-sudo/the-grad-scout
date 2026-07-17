// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";

interface DiscoveredContact {
  name: string;
  linkedin_url: string;
  graduation_year: string;
  country: string | null;
  headline: string | null;
}

function isValidLinkedIn(url: string): boolean {
  if (typeof url !== "string") return false;
  return /^https:\/\/(www\.)?linkedin\.com\/in\/[^\s]+/i.test(url);
}

function normalizeLinkedIn(url: string): string {
  // strip trailing slash and querystring for dedupe consistency
  return url.split("?")[0].replace(/\/+$/, "").toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const programId: string | undefined = body.program_id;
    const universityName: string = body.university_name ?? "";
    const programName: string = body.program_name ?? "";
    const userCountry: string = body.user_country ?? "";
    if (!programId) throw new Error("program_id is required");

    // Check cache: any contacts verified within last 90 days?
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await admin
      .from("program_contacts")
      .select("*")
      .eq("program_id", programId)
      .gte("last_verified_at", cutoff)
      .order("discovered_at", { ascending: false });

    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ ok: true, contacts: cached, cached: true }), {
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system =
      "You are a research assistant helping international master's degree applicants find and connect with current students and recent alumni of specific programs. Use web search to find real, publicly findable LinkedIn profiles of people who are currently enrolled in or have recently graduated from the specified master's program. Only return profiles that are publicly indexed and findable via a normal web search. If you cannot find a verifiable, publicly indexed LinkedIn URL for a person, exclude them entirely. Do not fabricate names or URLs.";

    const user = `Find current students and recent graduates (last 3 years) of this master's program who have publicly findable LinkedIn profiles:
University: ${universityName}
Program: ${programName}
User's home country: ${userCountry || "unspecified"}

Search using queries like '${programName} ${universityName} masters student LinkedIn site:linkedin.com/in' and similar. Prioritize finding people from ${userCountry || "the user's home country"} first since the user wants to connect with people from their own country — but also include people from other countries to give a fuller picture.

Return up to 10 results. Respond with ONLY a JSON array, no other text, no markdown fences:
[{
  "name": string,
  "linkedin_url": string (must be a real linkedin.com/in/ URL),
  "graduation_year": string (e.g. '2024', '2023', or 'Current student'),
  "country": string or null,
  "headline": string or null (their current role/title if visible in public search results — do not access their profile page to get this, only use what appears in the search result snippet)
}]`;

    const raw = await callLovableAI({ apiKey, system, user, maxTokens: 8000 });
    let parsed: DiscoveredContact[];
    try {
      parsed = parseJsonLoose(raw);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}`);
    }

    const seen = new Set<string>();
    const valid = parsed
      .filter((c) => c && c.name && isValidLinkedIn(c.linkedin_url))
      .map((c) => ({ ...c, linkedin_url: normalizeLinkedIn(c.linkedin_url) }))
      .filter((c) => {
        if (seen.has(c.linkedin_url)) return false;
        seen.add(c.linkedin_url);
        return true;
      });

    const now = new Date().toISOString();
    if (valid.length > 0) {
      const rows = valid.map((c) => ({
        program_id: programId,
        name: c.name,
        linkedin_url: c.linkedin_url,
        graduation_year: c.graduation_year ?? null,
        country: c.country ?? null,
        headline: c.headline ?? null,
        last_verified_at: now,
      }));
      const { error: upErr } = await admin
        .from("program_contacts")
        .upsert(rows, { onConflict: "program_id,linkedin_url", ignoreDuplicates: false });
      if (upErr) console.error("upsert program_contacts", upErr);
    }

    const { data: contacts } = await admin
      .from("program_contacts")
      .select("*")
      .eq("program_id", programId)
      .order("discovered_at", { ascending: false });

    return new Response(JSON.stringify({ ok: true, contacts: contacts ?? [], cached: false }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("find-program-contacts error", e);
    const msg = (e as Error).message ?? "Unknown error";
    const lower = msg.toLowerCase();
    let code: "ai_truncated" | "ai_rate_limit" | "ai_credits" | "ai_unavailable" | "config" | "unknown" = "unknown";
    if (lower.includes("truncated") || lower.includes("malformed") || lower.includes("parse")) code = "ai_truncated";
    else if (lower.includes("rate limit")) code = "ai_rate_limit";
    else if (lower.includes("credits")) code = "ai_credits";
    else if (lower.includes("lovable_api_key")) code = "config";
    else if (lower.includes("lovable ai")) code = "ai_unavailable";
    return new Response(
      JSON.stringify({ ok: false, error: msg, code, fallback: true }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }
});