-- 1. contact_enquiries: fail-closed reads
REVOKE SELECT, UPDATE, DELETE ON public.contact_enquiries FROM anon, authenticated;
GRANT INSERT ON public.contact_enquiries TO anon, authenticated;
GRANT ALL ON public.contact_enquiries TO service_role;
DROP POLICY IF EXISTS "No client reads of contact enquiries" ON public.contact_enquiries;
CREATE POLICY "No client reads of contact enquiries"
  ON public.contact_enquiries FOR SELECT TO anon, authenticated USING (false);

-- 2. promo_codes: service role only
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
GRANT ALL ON public.promo_codes TO service_role;
DROP POLICY IF EXISTS "No client access to promo codes" ON public.promo_codes;
CREATE POLICY "No client access to promo codes"
  ON public.promo_codes FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 3. forum_likes: users only see their own likes
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='forum_likes' AND cmd IN ('SELECT','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.forum_likes', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view their own likes"
  ON public.forum_likes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ensure insert/delete own-row policies exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='forum_likes' AND cmd='INSERT') THEN
    EXECUTE 'CREATE POLICY "Users can like" ON public.forum_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='forum_likes' AND cmd='DELETE') THEN
    EXECUTE 'CREATE POLICY "Users can unlike" ON public.forum_likes FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- aggregate count helpers (no per-user data exposed)
CREATE OR REPLACE FUNCTION public.get_post_like_counts(post_ids uuid[])
RETURNS TABLE (post_id uuid, like_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.post_id, count(*)::bigint
  FROM public.forum_likes l
  WHERE l.post_id = ANY(post_ids)
  GROUP BY l.post_id
$$;

CREATE OR REPLACE FUNCTION public.get_comment_like_counts(comment_ids uuid[])
RETURNS TABLE (comment_id uuid, like_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.comment_id, count(*)::bigint
  FROM public.forum_likes l
  WHERE l.comment_id = ANY(comment_ids)
  GROUP BY l.comment_id
$$;

REVOKE ALL ON FUNCTION public.get_post_like_counts(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_comment_like_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_like_counts(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_comment_like_counts(uuid[]) TO authenticated, service_role;