
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_trial_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS sandbox_stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS sandbox_subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS sandbox_subscription_status text,
  ADD COLUMN IF NOT EXISTS sandbox_subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS sandbox_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS sandbox_subscription_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS sandbox_discover_runs_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sandbox_ai_bullets_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sandbox_usage_reset_at timestamptz;
