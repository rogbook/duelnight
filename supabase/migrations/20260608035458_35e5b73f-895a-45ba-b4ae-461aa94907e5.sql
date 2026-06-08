-- Defense-in-depth: 권한 상승 방지를 위해 authenticated/anon/PUBLIC의 쓰기 권한 회수
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- SELECT는 본인 역할만 조회 가능 (기존 RLS 정책 유지)
GRANT SELECT ON public.user_roles TO authenticated;

-- service_role과 SECURITY DEFINER 함수만 쓰기 가능
GRANT ALL ON public.user_roles TO service_role;