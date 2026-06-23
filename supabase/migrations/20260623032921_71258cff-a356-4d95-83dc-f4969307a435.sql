
-- Extend programs
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS us_news_ranking int,
  ADD COLUMN IF NOT EXISTS school_ranking int,
  ADD COLUMN IF NOT EXISTS program_description text,
  ADD COLUMN IF NOT EXISTS duration_months int,
  ADD COLUMN IF NOT EXISTS degree_type text,
  ADD COLUMN IF NOT EXISTS apply_url text;

-- Extend program_admissions
ALTER TABLE public.program_admissions
  ADD COLUMN IF NOT EXISTS apply_url text,
  ADD COLUMN IF NOT EXISTS gre_gmat_requirement text,
  ADD COLUMN IF NOT EXISTS english_test_requirement text,
  ADD COLUMN IF NOT EXISTS accepted_english_tests jsonb;

-- Extend program_class_profile
ALTER TABLE public.program_class_profile
  ADD COLUMN IF NOT EXISTS avg_gre_quant numeric,
  ADD COLUMN IF NOT EXISTS avg_gre_verbal numeric,
  ADD COLUMN IF NOT EXISTS avg_work_exp_years numeric,
  ADD COLUMN IF NOT EXISTS profile_scope text,
  ADD COLUMN IF NOT EXISTS is_stem boolean;

-- Extend program_funding
ALTER TABLE public.program_funding
  ADD COLUMN IF NOT EXISTS tuition_per text,
  ADD COLUMN IF NOT EXISTS tuition_as_of text,
  ADD COLUMN IF NOT EXISTS ga_ta_gra_available boolean,
  ADD COLUMN IF NOT EXISTS ga_ta_gra_notes text,
  ADD COLUMN IF NOT EXISTS tuition_waiver_with_assistantship boolean,
  ADD COLUMN IF NOT EXISTS scholarship_notes text,
  ADD COLUMN IF NOT EXISTS accommodation_currency text,
  ADD COLUMN IF NOT EXISTS est_total_cost_of_attendance numeric;

-- New: program_city_info
CREATE TABLE IF NOT EXISTS public.program_city_info (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  city_name text,
  city_vibe text,
  nearest_major_city text,
  distance_to_major_city_km numeric,
  travel_time_to_major_city text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_city_info TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_city_info TO authenticated;
GRANT ALL ON public.program_city_info TO service_role;
ALTER TABLE public.program_city_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "city read all" ON public.program_city_info FOR SELECT USING (true);
CREATE POLICY "city write auth" ON public.program_city_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER program_city_info_set_updated_at BEFORE UPDATE ON public.program_city_info FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- New: program_career_stats
CREATE TABLE IF NOT EXISTS public.program_career_stats (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  placement_rate_pct numeric,
  avg_salary numeric,
  avg_salary_currency text,
  top_employers jsonb,
  top_industries jsonb,
  intl_student_salary_note text,
  salary_breakdown_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.program_career_stats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_career_stats TO authenticated;
GRANT ALL ON public.program_career_stats TO service_role;
ALTER TABLE public.program_career_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career read all" ON public.program_career_stats FOR SELECT USING (true);
CREATE POLICY "career write auth" ON public.program_career_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER program_career_stats_set_updated_at BEFORE UPDATE ON public.program_career_stats FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
