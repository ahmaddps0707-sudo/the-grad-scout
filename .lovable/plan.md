## Problem

Discovery runs finish "successfully" but insert zero programs. Edge function logs show every candidate discarded with `okCountry: false` — programs from the UK and Australia are returned even though the user's `target_countries` is `["United States"]`.

Root cause: `discover-universities` fires four Firecrawl queries in parallel — one generic plus hardcoded `site:.edu`, `site:.ac.uk`, and `site:.edu.au` — regardless of the user's target countries. The UK/AU results dominate the live-context pool, so Gemini picks non-US programs, which are then correctly rejected by the final country validator, leaving nothing to insert.

## Fix (only `supabase/functions/discover-universities/index.ts`)

1. **Country-aware search queries.** Build the Firecrawl query list from the user's `target_countries` instead of hardcoding TLDs:
   - Map each target country to its site filter(s): US → `site:.edu`, UK → `site:.ac.uk`, Australia → `site:.edu.au`, Canada → `site:.ca`, Germany → `site:.de`, Netherlands → `site:.nl`, France → `site:.fr`, Singapore → `site:.edu.sg`, Ireland → `site:.ie`, Hong Kong → `site:.edu.hk`, etc. Unknown countries fall back to a generic `"<major>" "<country>" master's admissions` query.
   - Always include one generic query per country: `master's <target_major> <country> admissions official tuition`.
   - Drop the mixed-TLD fan-out so UK/AU pages don't contaminate a US-only search.

2. **Country-scoped live context.** After Firecrawl, tag each result with the country it was searched for and prefer results from country-matched queries when trimming to the top ~24, so Gemini sees mostly on-target evidence.

3. **Prompt reinforcement.** In the user prompt, restate the target countries as a hard filter ("Do not include programs outside these countries") and repeat the country list right before the JSON schema. No new fields.

4. **Better failure signal.** When the validator discards everything, mark the job `done` with a soft `error: "no_matches_for_targets"` (kept as-is elsewhere) so the existing Low Results banner can explain the outcome instead of the current silent zero-insert.

No schema, RLS, UI, or other function changes.

## Files touched

- `supabase/functions/discover-universities/index.ts`
