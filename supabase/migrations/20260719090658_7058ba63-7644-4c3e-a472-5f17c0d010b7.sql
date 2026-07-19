
DROP POLICY IF EXISTS "Anyone can submit contact enquiries" ON public.contact_enquiries;
CREATE POLICY "Anyone can submit contact enquiries" ON public.contact_enquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(name)) > 0
    AND length(btrim(email)) between 3 and 320
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(btrim(message)) between 1 and 5000
  );
