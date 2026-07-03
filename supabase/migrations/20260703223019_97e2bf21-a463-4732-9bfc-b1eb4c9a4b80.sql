
-- forum_posts
CREATE TABLE public.forum_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('university','program','general')),
  tag_university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT ALL ON public.forum_posts TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_posts_read" ON public.forum_posts FOR SELECT TO authenticated USING (is_removed = false OR user_id = auth.uid());
CREATE POLICY "forum_posts_insert_own" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "forum_posts_update_own" ON public.forum_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "forum_posts_delete_own" ON public.forum_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_forum_posts_created ON public.forum_posts(created_at DESC);
CREATE INDEX idx_forum_posts_university ON public.forum_posts(tag_university_id);

-- forum_comments
CREATE TABLE public.forum_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_comments TO authenticated;
GRANT ALL ON public.forum_comments TO service_role;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_comments_read" ON public.forum_comments FOR SELECT TO authenticated USING (is_removed = false OR user_id = auth.uid());
CREATE POLICY "forum_comments_insert_own" ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "forum_comments_update_own" ON public.forum_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "forum_comments_delete_own" ON public.forum_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_forum_comments_post ON public.forum_comments(post_id, created_at);

-- forum_likes
CREATE TABLE public.forum_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forum_likes_one_target CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX forum_likes_user_post ON public.forum_likes(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX forum_likes_user_comment ON public.forum_likes(user_id, comment_id) WHERE comment_id IS NOT NULL;
GRANT SELECT, INSERT, DELETE ON public.forum_likes TO authenticated;
GRANT ALL ON public.forum_likes TO service_role;
ALTER TABLE public.forum_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_likes_read" ON public.forum_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "forum_likes_insert_own" ON public.forum_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "forum_likes_delete_own" ON public.forum_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- forum_flags
CREATE TABLE public.forum_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forum_flags_one_target CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX forum_flags_user_post ON public.forum_flags(reporter_user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX forum_flags_user_comment ON public.forum_flags(reporter_user_id, comment_id) WHERE comment_id IS NOT NULL;
GRANT SELECT, INSERT ON public.forum_flags TO authenticated;
GRANT ALL ON public.forum_flags TO service_role;
ALTER TABLE public.forum_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_flags_read_own" ON public.forum_flags FOR SELECT TO authenticated USING (reporter_user_id = auth.uid());
CREATE POLICY "forum_flags_insert_own" ON public.forum_flags FOR INSERT TO authenticated WITH CHECK (reporter_user_id = auth.uid());

-- forum_rate_limits
CREATE TABLE public.forum_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  posts_last_hour INT NOT NULL DEFAULT 0,
  comments_last_hour INT NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.forum_rate_limits TO authenticated;
GRANT ALL ON public.forum_rate_limits TO service_role;
ALTER TABLE public.forum_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_rate_limits_own" ON public.forum_rate_limits FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- profiles: last_visited_forum_at
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_visited_forum_at TIMESTAMPTZ;

-- Auto-remove after 3 flags (from different users)
CREATE OR REPLACE FUNCTION public.tg_forum_flag_auto_remove()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_user_id) INTO cnt FROM public.forum_flags WHERE post_id = NEW.post_id;
    UPDATE public.forum_posts SET is_flagged = true, is_removed = (cnt >= 3) OR is_removed WHERE id = NEW.post_id;
  ELSIF NEW.comment_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_user_id) INTO cnt FROM public.forum_flags WHERE comment_id = NEW.comment_id;
    UPDATE public.forum_comments SET is_flagged = true, is_removed = (cnt >= 3) OR is_removed WHERE id = NEW.comment_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_forum_flag_auto_remove AFTER INSERT ON public.forum_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_forum_flag_auto_remove();
