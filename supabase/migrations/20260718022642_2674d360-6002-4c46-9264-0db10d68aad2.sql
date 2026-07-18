
-- Promo controls: expiry, redemption caps, per-user tracking
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS times_redeemed integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.user_promo_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, promo_code_id)
);

GRANT SELECT ON public.user_promo_usage TO authenticated;
GRANT ALL ON public.user_promo_usage TO service_role;

ALTER TABLE public.user_promo_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own promo usage read"
  ON public.user_promo_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Missing service_role grants on existing tables
GRANT ALL ON public.promo_codes TO service_role;
GRANT ALL ON public.payment_history TO service_role;
