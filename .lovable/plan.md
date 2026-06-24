## Problem

`discover-universities` calls Gemini with `max_completion_tokens: 4096`. The new master's-only prompt asks for 5 programs with a long `match_rationale` plus extra fields (`degree_type`, `duration_months`), so the model is running out of tokens mid-string — the raw output ends inside `"program_name":`. The current `JSON.parse(stripFences(raw))` then throws "Unterminated string in JSON".

## Fix

### 1. `supabase/functions/_shared/lovable-ai.ts`
- Raise the default `maxTokens` from `4096` to `16000` so 5 detailed entries fit comfortably.
- Add a `parseJsonLoose(raw)` helper that:
  - runs `stripFences`
  - slices from the first `[`/`{` to the matching last `]`/`}`
  - removes trailing commas and control characters
  - tries `JSON.parse`; on failure, if the text looks truncated (unbalanced brackets, or ends inside a string), trims back to the last complete top-level array element (`...},`) and closes the array with `]` before parsing
  - throws a clear "AI response was truncated" error if recovery still fails
- Export it for both edge functions.

### 2. `supabase/functions/discover-universities/index.ts`
- Pass an explicit `maxTokens: 16000` to `callLovableAI`.
- Replace the current `JSON.parse(stripFences(raw))` block with `parseJsonLoose(raw)`.
- Keep current behaviour: insert however many valid programs came back (`parsed.slice(0, 5)`), so a partially-recovered response still produces some recommendations instead of failing the whole job.
- Keep the existing friendly error mapping; add a branch so a truncation error surfaces as "AI response was too long — please retry." on the `discover_jobs` row.

### 3. `supabase/functions/enrich-university/index.ts`
- Same swap to `parseJsonLoose` and `maxTokens: 16000` for consistency (enrichment returns even more JSON).

## Out of scope

- No schema, RLS, UI, or prompt changes.
- No retry-on-truncation loop — bumping the token cap plus loose parsing is sufficient; we can add retry later if it recurs.
