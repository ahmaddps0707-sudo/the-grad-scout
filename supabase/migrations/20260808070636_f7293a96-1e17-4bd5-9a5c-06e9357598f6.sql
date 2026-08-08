CREATE OR REPLACE FUNCTION public.tg_profiles_force_default_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.subscription_tier := 'free';
    NEW.subscription_status := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.subscription_current_period_end := NULL;
    NEW.subscription_start_date := NULL;
    NEW.cancel_at_period_end := false;
    NEW.trial_end_date := NULL;
    NEW.trial_used := false;
    NEW.payment_method_attached := false;
    NEW.discover_runs_used := 0;
    NEW.ai_bullets_used := 0;
    NEW.update_data_used := 0;
    NEW.usage_reset_at := now();
    NEW.sandbox_trial_used := false;
    NEW.sandbox_stripe_customer_id := NULL;
    NEW.sandbox_stripe_subscription_id := NULL;
    NEW.sandbox_subscription_tier := 'free';
    NEW.sandbox_subscription_status := NULL;
    NEW.sandbox_subscription_current_period_end := NULL;
    NEW.sandbox_cancel_at_period_end := false;
    NEW.sandbox_trial_end_date := NULL;
    NEW.sandbox_subscription_start_date := NULL;
    NEW.sandbox_discover_runs_used := 0;
    NEW.sandbox_ai_bullets_used := 0;
    NEW.sandbox_update_data_used := 0;
    NEW.sandbox_usage_reset_at := now();
    NEW.id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_profiles_force_default_billing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_force_default_billing ON public.profiles;
CREATE TRIGGER profiles_force_default_billing
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_force_default_billing();