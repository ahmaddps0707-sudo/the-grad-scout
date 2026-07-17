
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method_attached boolean NOT NULL DEFAULT false;

-- Widen check to allow trialing/incomplete/unpaid statuses coming from Stripe
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IS NULL OR subscription_status IN
    ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));

-- Payment history (per-user record of paid invoices for the Subscription section)
CREATE TABLE IF NOT EXISTS public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_invoice_id text UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  hosted_invoice_url text,
  invoice_pdf text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_history_user ON public.payment_history(user_id, paid_at DESC);

GRANT SELECT ON public.payment_history TO authenticated;
GRANT ALL ON public.payment_history TO service_role;

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own payments read" ON public.payment_history;
CREATE POLICY "own payments read" ON public.payment_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Promo codes (admin-managed, redeemed at checkout by passing to Stripe)
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  stripe_coupon_id text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active promo read" ON public.promo_codes;
CREATE POLICY "active promo read" ON public.promo_codes
  FOR SELECT TO authenticated USING (active = true);
