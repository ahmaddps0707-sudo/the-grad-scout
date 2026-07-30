CREATE TABLE public.qs_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_display text NOT NULL,
  rank_value integer NOT NULL,
  name text NOT NULL,
  country text NOT NULL,
  overall_score text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.qs_rankings TO service_role;

ALTER TABLE public.qs_rankings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_qs_rankings_country_rank ON public.qs_rankings (country, rank_value);