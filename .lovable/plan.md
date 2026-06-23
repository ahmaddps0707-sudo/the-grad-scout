## Goal

Tighten both LLM edge functions with stricter, master's-only prompts, capture richer enrichment data (city + career outcomes + extra ranking fields), and surface it in the detail page (two new tabs) and dashboard (extra ranking labels).

## 1. Database migration

New tables (each keyed 1:1 to `programs.id`, with RLS = public read + authenticated write, matching existing `program_admissions`):

- `program_city_info` — `program_id` (PK/FK), `city_name`, `city_vibe`, `nearest_major_city`, `distance_to_major_city_km` (numeric), `travel_time_to_major_city`, `updated_at`.
- `program_career_stats` — `program_id` (PK/FK), `placement_rate_pct` (numeric), `avg_salary` (numeric), `avg_salary_currency`, `top_employers` (jsonb), `top_industries` (jsonb), `intl_student_salary_note`, `salary_breakdown_notes`, `updated_at`.

Extend existing tables (additive only — keep current columns and RLS untouched):

- `programs`: add `us_news_ranking` (int), `school_ranking` (int), `program_description` (text), `duration_months` (int), `degree_type` (text), `apply_url` (text).
- `program_admissions`: add `apply_url`, `gre_gmat_requirement`, `english_test_requirement`, `accepted_english_tests` (jsonb).
- `program_class_profile`: add `avg_gre_quant`, `avg_gre_verbal`, `avg_work_exp_years`, `profile_scope` (text), `is_stem` (bool).
- `program_funding`: add `tuition_per`, `tuition_as_of`, `ga_ta_gra_notes`, `tuition_waiver_with_assistantship` (bool), `scholarship_notes`, `accommodation_currency`, `est_total_cost_of_attendance` (numeric). Rename intent: keep existing `ga_ta_availability` as-is (still written), add `ga_ta_gra_available` (bool).

Each new table gets standard GRANTs + RLS + `updated_at` trigger using the existing `tg_set_updated_at()`.

## 2. `supabase/functions/discover-universities/index.ts`

Replace system + user prompt with the master's-only version from the spec. Inject the live student profile values (target_major, target_countries, target_tier, funding_preference, budget_ceiling/currency, gpa, test_scores, work_exp_years, target_intake) and the excluded list. Parse the new shape (now includes `degree_type` + `duration_months`); persist `degree_type` and `duration_months` to `programs` on insert.

## 3. `supabase/functions/enrich-university/index.ts`

Replace system + user prompt with the deep-research version. Parse the nested JSON (`overview`, `admissions`, `class_profile`, `tuition_and_funding`, `city`, `career_outcomes`, `sources`) and upsert into:

- `programs` (us_news_ranking, school_ranking from `qs_ranking`-equivalent at school level, program_description, apply_url, last_verified_at)
- `program_admissions` (incl. new fields)
- `program_class_profile` (incl. new fields)
- `program_funding` (incl. new fields)
- `program_city_info` (new)
- `program_career_stats` (new)
- `program_research_sources` (replace existing rows)

## 4. `src/routes/_authenticated/university.$id.tsx`

- Load `program_city_info` and `program_career_stats` alongside existing reads.
- Add two `TabsTrigger` + `TabsContent`: **City** (city_vibe, nearest_major_city, distance_to_major_city_km + travel_time) and **Career Outcomes** (placement_rate_pct, avg_salary + currency, top_employers list, top_industries list, intl_student_salary_note, salary_breakdown_notes).
- Per-tab skeleton already exists pattern (`enriching && !data ? <SkeletonCard />`); extend to the two new tabs.
- Replace the current `DV` "Data not available" with "Not publicly available" everywhere on this page.
- Add Overview rows for `program_description`, `us_news_ranking`, QS ranking, `apply_url`.

## 5. `src/routes/_authenticated/dashboard.tsx`

`EntryCard` meta row currently shows `QS #N`. Extend to also show `US News #N` (from `program.us_news_ranking`) and `School #N` (from `program.school_ranking`) when present, comma-separated, keeping QS as the primary.

## 6. Types

After migration approval, `src/integrations/supabase/types.ts` regenerates automatically; new fields/tables become available without manual edits.

## Out of scope

- No auth/RLS changes to existing tables.
- No change to scoring logic.
- No web-search tool wiring (Lovable AI Gateway has no browsing tool); the prompt still instructs Gemini to use its knowledge and `null` anything unverifiable. We'll flag this caveat in the chat reply.
