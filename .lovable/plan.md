## Problem

The Outreach tab calls the `find-program-contacts` Edge Function via `supabase.functions.invoke(...)`. When the function returns any non-2xx status (a thrown error, AI truncation, parse failure, 429/402 from the gateway, etc.), the Supabase JS client surfaces it as the opaque message **"Edge Function returned a non-2xx status code"** with no detail, and the Outreach tab shows that as a toast with no recovery path.

No function logs are currently retained, so we cannot pinpoint which branch failed — but the fix is the same regardless: contain errors inside the function and degrade gracefully on the client.

## Fix

### 1. Edge Function: `supabase/functions/find-program-contacts/index.ts`

Wrap the whole handler so it **always returns HTTP 200** with a structured JSON body. The client decides what to render from the payload.

Response shape:
```
{ ok: true,  contacts: [...], cached: boolean }
{ ok: false, error: string, code: "ai_truncated" | "ai_rate_limit" | "ai_credits" | "ai_unavailable" | "config" | "unknown", fallback: true }
```

Behavior:
- Classify the caught error message (`truncated`/`malformed`, `rate limit`, `credits`, `LOVABLE_API_KEY not configured`, else `unknown`) into `code`.
- Still return 200 so `supabase.functions.invoke` resolves with `data` (not `error`).
- Keep the cache-hit path unchanged.
- If the AI returned zero valid contacts after parsing, return `ok: true, contacts: []` (not an error) so the UI shows the existing empty-state with the LinkedIn search fallback.
- Continue to log to `console.error` for future log inspection.

Only the error-handling shell changes; the prompt, cache logic, validation, upsert, and CORS stay the same.

### 2. Client: `src/components/outreach-tab.tsx`

In `load()`:
- Treat both `error` from `invoke` and `data.ok === false` as soft failures: do **not** toast a generic error.
- When `data.ok === false` with `fallback: true`, render the existing empty-state UI plus a small inline notice:
  - `ai_rate_limit` → "Contact discovery is busy right now. Try again in a moment."
  - `ai_credits` → "AI credits exhausted — ask the workspace owner to add credits."
  - `ai_truncated` / `ai_unavailable` / `unknown` → "We couldn't load contacts right now. You can still search LinkedIn directly below."
- Add a "Retry" button that re-runs `load()`.
- Keep the saved-contacts fetch independent — if contacts load fails, still try to fetch saved set so the UI stays consistent.

No DB, RLS, types, or other routes change.

## Out of scope

- No schema or RLS changes.
- No prompt or model changes (we already raised `maxTokens` to 8000 here).
- No retry loop inside the edge function — one attempt, contained failure, client-driven retry.
