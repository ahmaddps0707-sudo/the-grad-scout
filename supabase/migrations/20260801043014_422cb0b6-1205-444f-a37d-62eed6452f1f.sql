CREATE TABLE public.discover_failed_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_name text NOT NULL,
  reason text NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.discover_failed_candidates TO service_role;

ALTER TABLE public.discover_failed_candidates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dfc_user_name_failed_at
  ON public.discover_failed_candidates (user_id, university_name, failed_at DESC);