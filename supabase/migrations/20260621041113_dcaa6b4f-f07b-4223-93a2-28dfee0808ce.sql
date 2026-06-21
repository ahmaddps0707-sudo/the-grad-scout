
-- ============ ENUMS ============
CREATE TYPE public.entry_status AS ENUM (
  'scored','planning','in_review','in_progress','applied',
  'interview','offer','rejected','waitlisted','enrolled','archived'
);
CREATE TYPE public.entry_source AS ENUM ('scored','manual','discover_more');
CREATE TYPE public.discover_job_status AS ENUM ('pending','running','done','failed');
CREATE TYPE public.funding_pref AS ENUM ('fully_funded','partial_ok','self_funded_ok');
CREATE TYPE public.tier_pref AS ENUM ('top_10','top_50','top_100','no_preference');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  country_of_origin TEXT,
  target_degree_level TEXT DEFAULT 'masters',
  target_major TEXT,
  target_countries TEXT[] DEFAULT '{}',
  target_tier public.tier_pref,
  funding_preference public.funding_pref,
  budget_ceiling NUMERIC,
  budget_currency TEXT,
  gpa NUMERIC,
  test_scores JSONB DEFAULT '{}'::jsonb,
  work_exp_years NUMERIC,
  target_intake TEXT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PREFERENCE VECTORS ============
CREATE TABLE public.preference_vectors (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preference_vectors TO authenticated;
GRANT ALL ON public.preference_vectors TO service_role;
ALTER TABLE public.preference_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pref" ON public.preference_vectors FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ UNIVERSITIES (public catalog) ============
CREATE TABLE public.universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  country TEXT,
  city TEXT,
  qs_ranking INTEGER,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX universities_name_country_uq ON public.universities (name_normalized, COALESCE(lower(country),''));
GRANT SELECT ON public.universities TO anon, authenticated;
GRANT ALL ON public.universities TO service_role;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read universities" ON public.universities FOR SELECT TO anon, authenticated USING (true);

-- ============ PROGRAMS ============
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  degree_level TEXT,
  department TEXT,
  is_stem BOOLEAN,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX programs_uni_name_uq ON public.programs (university_id, name_normalized);
GRANT SELECT ON public.programs TO anon, authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read programs" ON public.programs FOR SELECT TO anon, authenticated USING (true);

-- ============ PROGRAM ADMISSIONS ============
CREATE TABLE public.program_admissions (
  program_id UUID PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  deadline_type TEXT,
  deadlines JSONB DEFAULT '[]'::jsonb,
  required_materials JSONB DEFAULT '[]'::jsonb,
  test_requirement_status TEXT,
  application_fee NUMERIC,
  application_fee_currency TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_admissions TO anon, authenticated;
GRANT ALL ON public.program_admissions TO service_role;
ALTER TABLE public.program_admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read adm" ON public.program_admissions FOR SELECT TO anon, authenticated USING (true);

-- ============ PROGRAM CLASS PROFILE ============
CREATE TABLE public.program_class_profile (
  program_id UUID PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  avg_gre NUMERIC, avg_gmat NUMERIC, avg_gpa NUMERIC,
  avg_ielts NUMERIC, avg_toefl NUMERIC,
  class_size INTEGER, intl_pct NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_class_profile TO anon, authenticated;
GRANT ALL ON public.program_class_profile TO service_role;
ALTER TABLE public.program_class_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cp" ON public.program_class_profile FOR SELECT TO anon, authenticated USING (true);

-- ============ PROGRAM FUNDING ============
CREATE TABLE public.program_funding (
  program_id UUID PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  tuition_amount NUMERIC,
  tuition_currency TEXT,
  ga_ta_availability TEXT,
  est_accommodation_low NUMERIC,
  est_accommodation_high NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_funding TO anon, authenticated;
GRANT ALL ON public.program_funding TO service_role;
ALTER TABLE public.program_funding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read funding" ON public.program_funding FOR SELECT TO anon, authenticated USING (true);

-- ============ PROGRAM RESEARCH SOURCES ============
CREATE TABLE public.program_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_research_sources TO anon, authenticated;
GRANT ALL ON public.program_research_sources TO service_role;
ALTER TABLE public.program_research_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read sources" ON public.program_research_sources FOR SELECT TO anon, authenticated USING (true);

-- ============ USER ENTRIES ============
CREATE TABLE public.user_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  score INTEGER,
  status public.entry_status NOT NULL DEFAULT 'scored',
  source public.entry_source NOT NULL DEFAULT 'scored',
  match_rationale TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_liked BOOLEAN NOT NULL DEFAULT false,
  is_disliked BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_entries_user_idx ON public.user_entries (user_id);
CREATE UNIQUE INDEX user_entries_unique ON public.user_entries (user_id, university_id, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_entries TO authenticated;
GRANT ALL ON public.user_entries TO service_role;
ALTER TABLE public.user_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries" ON public.user_entries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER user_entries_updated_at BEFORE UPDATE ON public.user_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ ENTRY STATUS HISTORY ============
CREATE TABLE public.entry_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.user_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  old_status public.entry_status,
  new_status public.entry_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entry_status_history_entry_idx ON public.entry_status_history (entry_id);
GRANT SELECT, INSERT ON public.entry_status_history TO authenticated;
GRANT ALL ON public.entry_status_history TO service_role;
ALTER TABLE public.entry_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history read" ON public.entry_status_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_log_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.entry_status_history (entry_id, user_id, old_status, new_status)
    VALUES (NEW.id, NEW.user_id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entry_status_history_trg AFTER UPDATE ON public.user_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_status_change();

-- ============ DISCOVER JOBS ============
CREATE TABLE public.discover_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.discover_job_status NOT NULL DEFAULT 'pending',
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX discover_jobs_user_idx ON public.discover_jobs (user_id, requested_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.discover_jobs TO authenticated;
GRANT ALL ON public.discover_jobs TO service_role;
ALTER TABLE public.discover_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.discover_jobs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
