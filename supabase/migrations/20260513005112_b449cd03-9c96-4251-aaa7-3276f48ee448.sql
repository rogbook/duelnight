REVOKE EXECUTE ON FUNCTION public.search_users(text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_users(text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_opponent_match(uuid, text, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_opponent_match(uuid, text, text, uuid) TO authenticated;