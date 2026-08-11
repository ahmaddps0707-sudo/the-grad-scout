REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  country_of_origin,
  target_degree_level,
  target_major,
  target_countries,
  target_country,
  target_tier,
  funding_preference,
  budget_ceiling,
  budget_currency,
  gpa,
  test_scores,
  work_exp_years,
  target_intake,
  onboarding_complete,
  last_visited_forum_at,
  updated_at
) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;