ALTER TABLE public.program_contacts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS added_by UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.program_contacts
  DROP CONSTRAINT IF EXISTS program_contacts_source_check;
ALTER TABLE public.program_contacts
  ADD CONSTRAINT program_contacts_source_check CHECK (source IN ('ai','user'));

CREATE INDEX IF NOT EXISTS idx_program_contacts_added_by ON public.program_contacts(added_by);

DROP POLICY IF EXISTS "program_contacts public read" ON public.program_contacts;
CREATE POLICY "program_contacts ai read"
  ON public.program_contacts FOR SELECT
  TO authenticated
  USING (source = 'ai');

CREATE POLICY "program_contacts owner read"
  ON public.program_contacts FOR SELECT
  TO authenticated
  USING (source = 'user' AND added_by = auth.uid());

CREATE POLICY "program_contacts owner insert"
  ON public.program_contacts FOR INSERT
  TO authenticated
  WITH CHECK (source = 'user' AND added_by = auth.uid());

CREATE POLICY "program_contacts owner delete"
  ON public.program_contacts FOR DELETE
  TO authenticated
  USING (source = 'user' AND added_by = auth.uid());