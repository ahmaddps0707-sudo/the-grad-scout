
-- Remove client-side read access to promo_codes (exposes stripe_coupon_id).
-- All promo validation happens server-side via service_role.
DROP POLICY IF EXISTS "active promo read" ON public.promo_codes;
REVOKE SELECT ON public.promo_codes FROM authenticated, anon;

-- Replace always-true write policies with authenticated-user checks.
DROP POLICY IF EXISTS "career write auth" ON public.program_career_stats;
CREATE POLICY "career write auth" ON public.program_career_stats
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "city write auth" ON public.program_city_info;
CREATE POLICY "city write auth" ON public.program_city_info
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated can insert programs" ON public.programs;
CREATE POLICY "authenticated can insert programs" ON public.programs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated can update programs" ON public.programs;
CREATE POLICY "authenticated can update programs" ON public.programs
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated can insert universities" ON public.universities;
CREATE POLICY "authenticated can insert universities" ON public.universities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated can update universities" ON public.universities;
CREATE POLICY "authenticated can update universities" ON public.universities
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
