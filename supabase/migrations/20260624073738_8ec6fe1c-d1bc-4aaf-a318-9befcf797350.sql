
-- program_contacts: shared catalog of discovered LinkedIn contacts per program
CREATE TABLE public.program_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  graduation_year TEXT,
  country TEXT,
  headline TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, linkedin_url)
);

GRANT SELECT ON public.program_contacts TO anon, authenticated;
GRANT ALL ON public.program_contacts TO service_role;

ALTER TABLE public.program_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_contacts public read"
  ON public.program_contacts FOR SELECT
  USING (true);

CREATE INDEX idx_program_contacts_program ON public.program_contacts(program_id);

-- user_saved_contacts: each user's personal saved contacts with kanban status
CREATE TABLE public.user_saved_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_contact_id UUID NOT NULL REFERENCES public.program_contacts(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_saved_contacts TO authenticated;
GRANT ALL ON public.user_saved_contacts TO service_role;

ALTER TABLE public.user_saved_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_saved_contacts owner select"
  ON public.user_saved_contacts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_saved_contacts owner insert"
  ON public.user_saved_contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_saved_contacts owner update"
  ON public.user_saved_contacts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_saved_contacts owner delete"
  ON public.user_saved_contacts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_user_saved_contacts_user ON public.user_saved_contacts(user_id);

CREATE TRIGGER tg_user_saved_contacts_touch
  BEFORE UPDATE ON public.user_saved_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
