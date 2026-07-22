// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLovableAI, CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { firecrawlSearch, concatSnippets } from "../_shared/firecrawl.ts";

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

// LinkedIn frequently returns 999 to bots, and full 200 for real users. We
// treat anything that isn't a hard 404/410 as "exists" — the goal is only to
// filter out clearly-dead URLs the model may have hallucinated. We fall back
// to trusting URLs that came directly from Firecrawl search results.
async function urlLikelyExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    // 404 / 410 = definitely dead. LinkedIn's 999 or 200/3xx = allow.
    if (res.status === 404 || res.status === 410) return false;
    return true;
  } catch (_e) {
    return false;
  }
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
    let userCountry: string = body.user_country ?? "";
    if (!programId) throw new Error("program_id is required");

    // Prefer the authoritative value from profiles.country_of_origin for the
    // requesting user. Falls back to whatever the caller passed in body.
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        const { data: userRes } = await admin.auth.getUser(token);
        const uid = userRes?.user?.id;
        if (uid) {
          const { data: prof } = await admin
            .from("profiles")
            .select("country_of_origin")
            .eq("id", uid)
            .maybeSingle();
          if (prof?.country_of_origin) userCountry = prof.country_of_origin;
        }
      }
    } catch (_e) {
      // If profile lookup fails, run search without country prioritization.
    }

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

    // Firecrawl search for public LinkedIn snippets (never scrape linkedin URLs)
    const [r1, r2, r3] = await Promise.all([
      firecrawlSearch(`site:linkedin.com/in ${programName} ${universityName} masters student`, { limit: 10 }),
      firecrawlSearch(`site:linkedin.com/in ${programName} ${universityName} alumni`, { limit: 10 }),
      userCountry
        ? firecrawlSearch(`site:linkedin.com/in ${programName} ${universityName} ${userCountry}`, { limit: 10 })
        : Promise.resolve([]),
    ]);
    const snippets = concatSnippets([...r1, ...r2, ...r3].filter((r) => /linkedin\.com\/in\//i.test(r.url)));
    const searchUrls = new Set(
      [...r1, ...r2, ...r3]
        .map((r) => r.url)
        .filter((u) => /linkedin\.com\/in\//i.test(u))
        .map(normalizeLinkedIn),
    );

    const system =
      "You are a research assistant helping international master's applicants find students and alumni to contact. Only extract profiles explicitly present in the search snippets provided. Never invent names or URLs not found in the context.";

    const priorityLine = userCountry
      ? `Prioritize returning people from ${userCountry} first in the results array, but do not limit results to only that country. Include students and alumni from all countries — just rank the user's home country contacts higher. If no contacts from ${userCountry} are found, return contacts from other countries normally.`
      : `Include students and alumni from all countries.`;

    const user = `From the following public search result snippets, extract LinkedIn profiles of current students or recent graduates (last 3 years) of this master's program. ${priorityLine} Only include entries with a valid linkedin.com/in/ URL present in the snippets.

University: ${universityName}
Program: ${programName}

Search snippets:
${snippets || "(no snippets found — return an empty array)"}

Return up to 10 results as ONLY a JSON array, no markdown fences:
[{
  "name": string,
  "linkedin_url": string,
  "graduation_year": string or "Current student",
  "country": string or null,
  "headline": string or null
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
    const candidates = parsed
      .filter((c) => c && c.name && isValidLinkedIn(c.linkedin_url))
      .map((c) => ({ ...c, linkedin_url: normalizeLinkedIn(c.linkedin_url) }))
      .filter((c) => {
        if (seen.has(c.linkedin_url)) return false;
        seen.add(c.linkedin_url);
        return true;
      })
      // Only trust URLs that actually appeared in the search results —
      // this prevents the model from inventing profile slugs.
      .filter((c) => searchUrls.has(c.linkedin_url));

    // Extra safety: verify each surviving URL is reachable (not 404/410).
    const verified = await Promise.all(
      candidates.map(async (c) => ((await urlLikelyExists(c.linkedin_url)) ? c : null)),
    );
    const valid = verified.filter((c): c is DiscoveredContact => c !== null);

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
    return new Response(JSON.stringify({ ok: false, error: msg, code, fallback: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});
