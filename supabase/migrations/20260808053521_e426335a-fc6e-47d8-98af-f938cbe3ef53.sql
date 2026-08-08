REVOKE ALL ON FUNCTION public.get_post_like_counts(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_comment_like_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_like_counts(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_comment_like_counts(uuid[]) TO authenticated, service_role;