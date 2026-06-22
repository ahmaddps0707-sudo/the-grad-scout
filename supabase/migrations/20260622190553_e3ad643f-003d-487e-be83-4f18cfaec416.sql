
CREATE POLICY "authenticated can insert universities" ON public.universities
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update universities" ON public.universities
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can insert programs" ON public.programs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update programs" ON public.programs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
