ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS update_data_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sandbox_update_data_used integer NOT NULL DEFAULT 0;