# Switch default model to Gemini 3.5 Flash

Update the shared Lovable AI helper so all edge functions use `google/gemini-3.5-flash` instead of `google/gemini-2.5-pro`.

## Change

- `supabase/functions/_shared/lovable-ai.ts`: change `DEFAULT_MODEL` from `google/gemini-2.5-pro` to `google/gemini-3.5-flash`.

All callers (`discover-universities`, `enrich-university`, `find-program-contacts`, `parse-resume`, `resume-ai-assist`, `resume-ai-accept`) rely on this default, so no other edits are needed unless any of them pass an explicit `model` override — I'll verify and update those too if present.
