-- discover_failed_candidates: owner-only read, writes stay service-role only
GRANT SELECT ON public.discover_failed_candidates TO authenticated;
GRANT ALL ON public.discover_failed_candidates TO service_role;
CREATE POLICY "Users can view their own failed candidates"
  ON public.discover_failed_candidates FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- qs_rankings: non-sensitive public reference data, read-only
GRANT SELECT ON public.qs_rankings TO anon, authenticated;
GRANT ALL ON public.qs_rankings TO service_role;
CREATE POLICY "Rankings are publicly readable"
  ON public.qs_rankings FOR SELECT TO anon, authenticated
  USING (true);

-- promo_codes: intentionally no client access; validation happens server-side
GRANT ALL ON public.promo_codes TO service_role;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;

-- entry_status_history: owners may read their history; writes only via trigger/service role
GRANT SELECT ON public.entry_status_history TO authenticated;
GRANT ALL ON public.entry_status_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.entry_status_history FROM anon, authenticated;