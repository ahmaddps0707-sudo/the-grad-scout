# Fix accuracy: ground the LLM in real web search

## Why the results are bad today

All three AI edge functions (`discover-universities`, `enrich-university`, `find-program-contacts`) call **Google Gemini 2.5 Pro** through the Lovable AI Gateway. The gateway has **no live web-search tool**, so Gemini answers from its training-data memory. That directly causes what you're seeing:

- **Outdated deadlines / tuition / program names** — knowledge cutoff, not today's site.
- **Broken links** — the model invents plausible-looking URLs it never visited, so many 404.
- **Fake LinkedIn profiles** — hallucinated names and `/in/…` slugs that were never verified.

No model swap alone fixes this. The fix is to make the functions *search the real web first*, then let the model summarize verified sources.

## Approach

Add **Tavily** as a web-search + content-extraction provider (best free tier for LLM pipelines, ~1000 searches/mo free, single API key). Use it as the ground truth; Gemini's only job becomes structuring the fetched content.

### 1. Secret + shared helper
- Add `TAVILY_API_KEY` secret (I'll prompt you to paste it after you sign up at tavily.com — free).
- New `supabase/functions/_shared/tavily.ts` with two helpers:
  - `tavilySearch(query, {maxResults, includeDomains?})` → returns real URLs + snippets.
  - `tavilyExtract(urls[])` → fetches page content as clean text.

### 2. `discover-universities` — rewrite pipeline
Instead of "ask Gemini for 10 programs":
1. Tavily search: `"master's in {major} programs {country?}" site:.edu OR site:.ac.uk …` (multiple queries).
2. Collect real result URLs (dedupe by university domain).
3. For each candidate, Tavily-extract the program page.
4. Pass the extracted content to Gemini with a strict "only use facts in this text, cite the URL, return null otherwise" prompt.
5. Drop any program whose `website_url` doesn't resolve to a 200 (quick HEAD check).

### 3. `enrich-university` — rewrite pipeline
1. Tavily search for the specific program's official page, tuition page, deadlines page, class profile page (4 targeted queries).
2. Tavily-extract the top result of each.
3. Feed the combined text to Gemini with the existing structured-output prompt, but the system message forbids any field not backed by the extracted content.
4. Store the actual source URLs Tavily returned in `program_research_sources` (replacing today's model-fabricated list).
5. Add a HEAD-check on `apply_url` before saving; null it out on 4xx/5xx so the UI's "Not publicly available" shows instead of a broken link.

### 4. `find-program-contacts` — realistic reset
LinkedIn blocks generic web crawlers from indexing most profiles, so **no LLM-plus-search combo will reliably find real students**. Two changes:
- Run a narrow Tavily search restricted to `site:linkedin.com/in/`. Only keep results whose URL Tavily actually returned (no hallucinated URLs possible now). Expect low volume — that's the honest ceiling without a paid LinkedIn data provider.
- Add clear UI copy on the Outreach tab: "AI-discovered profiles are a starting point — verify each link. Use 'Add contact' for profiles you find yourself." (The Add contact flow already exists.)
- Later option (not in this plan): add Proxycurl for real LinkedIn data — paid per lookup, worth its own decision.

### 5. UI honesty polish
- On the university card and detail page, show a small "Verified {date}" chip using `last_verified_at`, plus "Sources" popover linking to the real Tavily URLs stored in `program_research_sources`.
- If Tavily returns no usable pages, surface an amber banner: "We couldn't verify fresh data for this program — showing model estimates. Please check the official site."
- No DB schema changes required — `program_research_sources` already exists.

## What stays the same
- Model stays `google/gemini-2.5-pro` via the Lovable AI Gateway (it's fine at summarizing text you hand it — it just can't browse).
- All tables, RLS, tier limits, routes, and other features untouched.

## Files touched
- New: `supabase/functions/_shared/tavily.ts`
- Edit: `supabase/functions/discover-universities/index.ts`
- Edit: `supabase/functions/enrich-university/index.ts`
- Edit: `supabase/functions/find-program-contacts/index.ts`
- Edit: `src/components/outreach-tab.tsx` (disclaimer copy)
- Edit: `src/routes/_authenticated/university.$id.tsx` (Verified chip + Sources popover + amber banner)

## What I need from you before build
1. Sign up at **tavily.com** (free) → API Keys → copy your key.
2. I'll add it as the `TAVILY_API_KEY` secret and then implement.

## Cost / limits note
Tavily free tier (~1000 searches/mo) covers discover + enrich for ~50 university lookups per month per user. If usage grows, upgrade Tavily or gate more aggressively via the existing tier limits — no code changes needed.
