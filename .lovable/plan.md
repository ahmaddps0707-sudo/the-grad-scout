## What's actually happening

The `Anthropic API 401 ... invalid x-api-key` error in your logs is **stale** — it was emitted ~2 minutes *before* the edge functions were updated to use the Lovable AI Gateway (Gemini). The current code in `supabase/functions/discover-universities/index.ts` and `supabase/functions/enrich-university/index.ts` already calls `callLovableAI` against `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-2.5-pro`, and there is no remaining reference to Anthropic anywhere under `supabase/`.

So nothing in the codebase needs to change to remove Anthropic. What you're hitting now is most likely one of:

1. The browser/edge cached the previous failed `discover_jobs` row and is surfacing its old `error` field on the dashboard.
2. The new edge function deployment hadn't propagated when you retried.
3. A real new failure from the Gemini call (parse error, empty response, etc.) that we should see fresh in logs.

## Plan

1. **Confirm by re-triggering**: from the dashboard, click "Discover more" once. Then I'll pull the latest `discover-universities` logs — if they're clean, we're done. If a new error appears, we fix that specific one (most likely JSON parse or empty content from Gemini).
2. **Clear stale failed jobs** so the dashboard stops showing the old Anthropic error message: mark any `discover_jobs` row with `status = 'failed'` and an `error` containing "Anthropic" as dismissed (or delete them) for the current user.
3. **Harden the Gemini call** so a future bad response doesn't look like the old Anthropic error:
   - If `choices[0].message.content` is empty, throw `"Gemini returned empty content"` (clearer signal than a JSON parse error).
   - Strip a leading ` ```json ` *and* any leading prose before the first `[` / `{` before parsing, so minor model preamble doesn't fail parsing.
   - On failure, store a short, user-friendly message on the `discover_jobs` row (e.g. "AI research failed — please retry") instead of the raw exception, and surface that on the dashboard.

## Technical details

- Files touched: `supabase/functions/_shared/lovable-ai.ts` (empty-content guard + stronger fence/preamble stripping), `supabase/functions/discover-universities/index.ts` and `supabase/functions/enrich-university/index.ts` (friendlier `discover_jobs.error` text on catch).
- No DB migration required. Optional one-time cleanup query to clear stale failed jobs:
  ```sql
  delete from public.discover_jobs
  where status = 'failed' and error ilike '%Anthropic%';
  ```
- No secrets change. `LOVABLE_API_KEY` is already present.

Approve and I'll apply step 2 + 3, then ask you to click "Discover more" once so we can confirm against fresh logs.