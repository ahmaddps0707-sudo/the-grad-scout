## Goal
Use your personal Firecrawl API key directly (bypass the connector gateway) so discovery/enrichment work immediately.

## Steps

1. **Collect the key securely**
   - Prompt you via `add_secret` to paste `FIRECRAWL_API_KEY` (fc-… format). Stored as a Supabase Edge Function secret; never committed to code.

2. **Switch `supabase/functions/_shared/firecrawl.ts` to direct-API mode**
   - Remove gateway URL + `X-Connection-Api-Key` / `LOVABLE_API_KEY` headers.
   - Call `https://api.firecrawl.dev/v2/{search,scrape,map}` with `Authorization: Bearer ${FIRECRAWL_API_KEY}`.
   - Keep existing `FirecrawlProviderError` behavior (throw on 401/402/403/429/5xx) so refund logic in `discover-universities` still works.
   - Read the key from `Deno.env.get("FIRECRAWL_API_KEY")`; throw a clear error if missing.

3. **Redeploy affected Edge Functions** so they pick up the new secret + code:
   - `discover-universities`
   - `enrich-university`
   - `find-program-contacts` (any other caller of the shared helper)

4. **Verify**
   - Trigger Discovery from the dashboard with your test account.
   - Confirm real programs are added and `discover_runs_used` increments only on success.
   - On any Firecrawl error, confirm the specific toast fires and the run is refunded.

## Testing in preview
- Go to `/dashboard` → click **Discover**.
- Expect programs to populate within ~30–60s.
- Open a university → click **Update Data** to test enrichment path.
- If Firecrawl returns 402 again, you'll see the "temporarily unavailable" toast and no run consumed.

## Notes
- Connector-gateway Firecrawl link stays as-is (unused) — no cleanup needed.
- If later you get gateway access, we can flip back by restoring the two headers and gateway URL.
