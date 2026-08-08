-- Prevent owners from clearing moderation flags on forum posts/comments
CREATE OR REPLACE FUNCTION public.tg_forum_preserve_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / privileged callers bypass; only constrain end users
  IF auth.uid() IS NOT NULL THEN
    NEW.is_flagged := OLD.is_flagged;
    NEW.is_removed := OLD.is_removed;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS forum_posts_preserve_moderation ON public.forum_posts;
CREATE TRIGGER forum_posts_preserve_moderation
BEFORE UPDATE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.tg_forum_preserve_moderation();

DROP TRIGGER IF EXISTS forum_comments_preserve_moderation ON public.forum_comments;
CREATE TRIGGER forum_comments_preserve_moderation
BEFORE UPDATE ON public.forum_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_forum_preserve_moderation();

-- Trigger-only SECURITY DEFINER functions should not be directly callable by clients
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_forum_flag_auto_remove() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_log_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_forum_preserve_moderation() FROM PUBLIC, anon, authenticated;

-- Aggregate like-count helpers stay callable (they expose only counts, no user identity)
GRANT EXECUTE ON FUNCTION public.get_post_like_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_comment_like_counts(uuid[]) TO authenticated;