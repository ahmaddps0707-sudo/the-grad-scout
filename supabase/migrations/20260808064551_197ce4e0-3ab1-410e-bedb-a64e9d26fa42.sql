-- 1) Protect billing/usage columns on profiles from client-side tampering
CREATE OR REPLACE FUNCTION public.tg_profiles_preserve_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.subscription_current_period_end := OLD.subscription_current_period_end;
    NEW.subscription_start_date := OLD.subscription_start_date;
    NEW.cancel_at_period_end := OLD.cancel_at_period_end;
    NEW.trial_end_date := OLD.trial_end_date;
    NEW.trial_used := OLD.trial_used;
    NEW.payment_method_attached := OLD.payment_method_attached;
    NEW.discover_runs_used := OLD.discover_runs_used;
    NEW.ai_bullets_used := OLD.ai_bullets_used;
    NEW.update_data_used := OLD.update_data_used;
    NEW.usage_reset_at := OLD.usage_reset_at;
    NEW.sandbox_trial_used := OLD.sandbox_trial_used;
    NEW.sandbox_stripe_customer_id := OLD.sandbox_stripe_customer_id;
    NEW.sandbox_stripe_subscription_id := OLD.sandbox_stripe_subscription_id;
    NEW.sandbox_subscription_tier := OLD.sandbox_subscription_tier;
    NEW.sandbox_subscription_status := OLD.sandbox_subscription_status;
    NEW.sandbox_subscription_current_period_end := OLD.sandbox_subscription_current_period_end;
    NEW.sandbox_cancel_at_period_end := OLD.sandbox_cancel_at_period_end;
    NEW.sandbox_trial_end_date := OLD.sandbox_trial_end_date;
    NEW.sandbox_subscription_start_date := OLD.sandbox_subscription_start_date;
    NEW.sandbox_discover_runs_used := OLD.sandbox_discover_runs_used;
    NEW.sandbox_ai_bullets_used := OLD.sandbox_ai_bullets_used;
    NEW.sandbox_update_data_used := OLD.sandbox_update_data_used;
    NEW.sandbox_usage_reset_at := OLD.sandbox_usage_reset_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tg_profiles_preserve_billing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_preserve_billing ON public.profiles;
CREATE TRIGGER profiles_preserve_billing
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_preserve_billing();

-- 2) Replace SECURITY DEFINER like-count RPCs with maintained counters
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_comments ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

UPDATE public.forum_posts p
SET like_count = COALESCE((SELECT count(*) FROM public.forum_likes l WHERE l.post_id = p.id), 0);
UPDATE public.forum_comments c
SET like_count = COALESCE((SELECT count(*) FROM public.forum_likes l WHERE l.comment_id = c.id), 0);

CREATE OR REPLACE FUNCTION public.tg_forum_like_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.forum_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.comment_id IS NOT NULL THEN
      UPDATE public.forum_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.forum_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    ELSIF OLD.comment_id IS NOT NULL THEN
      UPDATE public.forum_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    END IF;
    RETURN OLD;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.tg_forum_like_counts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS forum_likes_count_ins ON public.forum_likes;
CREATE TRIGGER forum_likes_count_ins
AFTER INSERT ON public.forum_likes
FOR EACH ROW EXECUTE FUNCTION public.tg_forum_like_counts();

DROP TRIGGER IF EXISTS forum_likes_count_del ON public.forum_likes;
CREATE TRIGGER forum_likes_count_del
AFTER DELETE ON public.forum_likes
FOR EACH ROW EXECUTE FUNCTION public.tg_forum_like_counts();

-- like_count must not be forgeable by owners of the post/comment
CREATE OR REPLACE FUNCTION public.tg_forum_preserve_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.is_flagged := OLD.is_flagged;
    NEW.is_removed := OLD.is_removed;
    NEW.user_id := OLD.user_id;
    NEW.like_count := OLD.like_count;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tg_forum_preserve_moderation() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.get_post_like_counts(uuid[]);
DROP FUNCTION IF EXISTS public.get_comment_like_counts(uuid[]);