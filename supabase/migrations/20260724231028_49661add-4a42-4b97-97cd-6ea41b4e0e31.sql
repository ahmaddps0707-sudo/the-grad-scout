ALTER TABLE public.program_admissions
  ADD COLUMN IF NOT EXISTS gre_required TEXT,
  ADD COLUMN IF NOT EXISTS gmat_required TEXT,
  ADD COLUMN IF NOT EXISTS gre_gmat_notes TEXT;