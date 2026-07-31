-- 1. Remove unrestricted authenticated writes on shared catalog tables
DROP POLICY IF EXISTS "authenticated can insert programs" ON public.programs;
DROP POLICY IF EXISTS "authenticated can update programs" ON public.programs;
DROP POLICY IF EXISTS "authenticated can insert universities" ON public.universities;
DROP POLICY IF EXISTS "authenticated can update universities" ON public.universities;
DROP POLICY IF EXISTS "city write auth" ON public.program_city_info;
DROP POLICY IF EXISTS "career write auth" ON public.program_career_stats;

REVOKE INSERT, UPDATE, DELETE ON public.programs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.universities FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.program_city_info FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.program_career_stats FROM authenticated;

GRANT ALL ON public.programs TO service_role;
GRANT ALL ON public.universities TO service_role;
GRANT ALL ON public.program_city_info TO service_role;
GRANT ALL ON public.program_career_stats TO service_role;

-- 2. Scope AI-sourced contacts to programs the user is actually engaging with
DROP POLICY IF EXISTS "program_contacts ai read" ON public.program_contacts;

CREATE POLICY "program_contacts ai read scoped"
ON public.program_contacts
FOR SELECT
TO authenticated
USING (
  source = 'ai'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_entries ue
      WHERE ue.user_id = auth.uid()
        AND ue.program_id = program_contacts.program_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_saved_contacts usc
      WHERE usc.user_id = auth.uid()
        AND usc.program_contact_id = program_contacts.id
    )
  )
);