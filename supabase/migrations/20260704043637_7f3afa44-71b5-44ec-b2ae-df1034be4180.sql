
-- Resume Builder tables

CREATE TABLE public.resume_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('business','stem','social_sciences','arts','general')),
  description TEXT,
  preview_image_url TEXT,
  layout_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.resume_templates TO anon, authenticated;
GRANT ALL ON public.resume_templates TO service_role;
ALTER TABLE public.resume_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates are readable by everyone" ON public.resume_templates FOR SELECT USING (true);

CREATE TABLE public.resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL DEFAULT 'Version 1',
  template_id UUID REFERENCES public.resume_templates(id) ON DELETE SET NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL CHECK (source IN ('upload','scratch')),
  original_file_url TEXT,
  parse_status TEXT CHECK (parse_status IN ('pending','parsing','done','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own resumes" ON public.resumes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX resumes_user_idx ON public.resumes(user_id);

CREATE TRIGGER resumes_set_updated_at BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.resume_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  raw_input TEXT,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_suggestion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_ai_suggestions TO authenticated;
GRANT ALL ON public.resume_ai_suggestions TO service_role;
ALTER TABLE public.resume_ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai suggestions" ON public.resume_ai_suggestions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed templates
INSERT INTO public.resume_templates (name, category, description, sort_order) VALUES
  ('Clean Professional','general','Simple single-column layout, works across all program types',1),
  ('Business & MBA','business','Two-column header, emphasis on leadership and impact metrics — suited for MBA and management programs',2),
  ('Technical & STEM','stem','Clean layout with dedicated skills and projects sections — suited for engineering, CS, and sciences programs',3),
  ('Research & Academia','social_sciences','Publications and research experience foregrounded — suited for research-heavy master''s programs',4);

-- Storage RLS: users may only access files under resumes/{user_id}/*
CREATE POLICY "Users read own resume files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own resume files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own resume files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own resume files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
