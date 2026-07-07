
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','paid')),
  ADD COLUMN IF NOT EXISTS subscription_status text CHECK (subscription_status IN ('active','canceled','past_due')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS discover_runs_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_bullets_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_reset_at timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month';
