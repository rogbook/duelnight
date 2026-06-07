
-- 1) lfg_posts: contact/kakao_link 컬럼을 일반 SELECT에서 차단 (get_lfg_contact RPC로만 접근)
REVOKE SELECT (contact, kakao_link) ON public.lfg_posts FROM authenticated, anon;
GRANT SELECT (
  id, game, user_id, title, body, location, meet_at, store_id,
  duration_minutes, games_count, quick_match, category, status,
  created_at, updated_at
) ON public.lfg_posts TO authenticated;

-- 2) lfg_messages: Realtime publication에서 제거 (브로드캐스트 누출 위험 차단)
ALTER PUBLICATION supabase_realtime DROP TABLE public.lfg_messages;
