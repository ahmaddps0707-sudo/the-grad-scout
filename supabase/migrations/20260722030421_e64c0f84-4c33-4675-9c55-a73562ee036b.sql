ALTER TABLE public.program_class_profile
  ADD COLUMN IF NOT EXISTS gre_total_range text,
  ADD COLUMN IF NOT EXISTS gre_quant numeric,
  ADD COLUMN IF NOT EXISTS gre_quant_range text,
  ADD COLUMN IF NOT EXISTS gre_verbal numeric,
  ADD COLUMN IF NOT EXISTS gre_verbal_range text;