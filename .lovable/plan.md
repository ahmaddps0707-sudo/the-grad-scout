## Problem

Every Discovery run fails silently because Firecrawl returns `402 Insufficient credits` on every search. Because the code catches the error and returns an empty list, the job completes as `done` with `no_matches_for_targets`, the UI shows "Discovery complete – 0 programs", and the user's `sandbox_discover_runs_used` counter still increments.

## Fixes

### 1. Top up Firecrawl (you)
Add credits at firecrawl.dev/pricing on the account whose key is stored as `FIRECRAWL_API_KEY`. No code needed for this step.

### 2. Stop masking search-provider failures (code)
In `supabase/functions/discover-universities/index.ts`:
- Detect `402` (or any non-2xx) from Firecrawl inside the shared search helper and propagate a typed error (`search_provider_out_of_credits` / `search_provider_error`) instead of returning `[]`.
- In the job runner, catch that typed error and:
  - Set `discover_jobs.status = 'failed'`, `error = 'search_provider_out_of_credits'`.
  - Refund the run: decrement `sandbox_discover_runs_used` / `discover_runs_used` for the environment used.
  - Do not overwrite it with `no_matches_for_targets`.

### 3. Surface the real reason in the UI
In the dashboard discover flow (`src/routes/_authenticated/dashboard.tsx` and the toast handler that reads job status):
- When `error === 'search_provider_out_of_credits'`, show a destructive toast: "Search service is temporarily unavailable. Your run wasn't counted — please try again in a few minutes." (No mention of Firecrawl to end users.)
- Keep the existing `no_matches_for_targets` copy for the genuine zero-result case.

### 4. Refund the 3 counted runs from today (one-time)
Reset `sandbox_discover_runs_used` back to `0` for your test account (`62496503-8ce8-490f-af71-56c9a5b4fa2b`) so you can retest immediately after topping up.

## How to test in preview after top-up

1. Go to `/dashboard` → click **Discover**.
2. Expect toast "Discovery complete" with N > 0 programs, or, if Firecrawl still 402s, the new destructive toast and no counter increment.
3. Confirm counter: open Settings → check "Discover runs used" stays flat on failure and increments only on success.
4. Force-fail path (optional, later): temporarily set `FIRECRAWL_API_KEY` to an invalid value in a dev branch and verify the failure toast + counter refund; then restore.

## Technical notes

- Files touched: `supabase/functions/discover-universities/index.ts`, `supabase/functions/_shared/firecrawl.ts` (error propagation), `src/routes/_authenticated/dashboard.tsx` (toast branching). One-off SQL update to reset the counter.
- Counter refund uses the same env-scoped column helper introduced earlier (`envScopedSub`) so live vs sandbox stays isolated.
- No schema change required — `discover_jobs.status` and `error` columns already exist.
