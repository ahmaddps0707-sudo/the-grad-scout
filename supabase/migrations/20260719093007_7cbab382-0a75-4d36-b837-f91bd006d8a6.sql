
ALTER TABLE public.program_class_profile
  ADD COLUMN IF NOT EXISTS gre_total numeric,
  ADD COLUMN IF NOT EXISTS gre_total_note text,
  ADD COLUMN IF NOT EXISTS avg_gre_quant_note text,
  ADD COLUMN IF NOT EXISTS avg_gre_verbal_note text,
  ADD COLUMN IF NOT EXISTS avg_gmat_note text,
  ADD COLUMN IF NOT EXISTS avg_gpa_note text,
  ADD COLUMN IF NOT EXISTS avg_ielts_note text,
  ADD COLUMN IF NOT EXISTS avg_toefl_note text,
  ADD COLUMN IF NOT EXISTS avg_work_exp_note text,
  ADD COLUMN IF NOT EXISTS intl_student_pct_note text;

ALTER TABLE public.program_funding
  ADD COLUMN IF NOT EXISTS tuition_note text,
  ADD COLUMN IF NOT EXISTS avg_salary_note text;
