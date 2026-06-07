
-- =========================================================
-- 1) user_drive_tokens: 클라이언트 정책 전면 제거 (서버 전용)
-- =========================================================
DROP POLICY IF EXISTS "Users can select own drive tokens" ON public.user_drive_tokens;
DROP POLICY IF EXISTS "Users can insert own drive tokens" ON public.user_drive_tokens;
DROP POLICY IF EXISTS "Users can update own drive tokens" ON public.user_drive_tokens;
DROP POLICY IF EXISTS "Users can delete own drive tokens" ON public.user_drive_tokens;

-- 클라이언트(anon/authenticated)에 직접 데이터 API 접근 차단
REVOKE ALL ON public.user_drive_tokens FROM anon, authenticated;
-- service_role(서버)만 사용
GRANT ALL ON public.user_drive_tokens TO service_role;

-- RLS는 그대로 유지 — 정책이 없으므로 client는 default deny
ALTER TABLE public.user_drive_tokens ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2) friendships: 수락/거절은 addressee만, requester는 취소(DELETE)만
-- =========================================================
DROP POLICY IF EXISTS "friendships update participant" ON public.friendships;

CREATE POLICY "friendships update addressee only"
  ON public.friendships
  FOR UPDATE
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- =========================================================
-- 3) lfg_posts: contact / kakao_link 컬럼을 클라이언트에서 차단
--    (작성자/수락된 참여자는 SECURITY DEFINER 함수 get_lfg_contact 사용)
-- =========================================================
REVOKE SELECT (contact, kakao_link) ON public.lfg_posts FROM anon, authenticated;

-- INSERT/UPDATE는 본인 게시물에만 허용되므로 그대로 두어도 됨 (RLS로 user_id 일치 확인)
-- 작성자가 자기 contact/kakao_link 입력은 INSERT/UPDATE 권한이 필요하므로 그쪽은 유지
GRANT INSERT (contact, kakao_link), UPDATE (contact, kakao_link)
  ON public.lfg_posts TO authenticated;

-- =========================================================
-- 4) subscriptions.billing_key → 별도 서버 전용 테이블로 분리
-- =========================================================
CREATE TABLE IF NOT EXISTS public.subscription_billing (
  user_id uuid PRIMARY KEY,
  billing_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 클라이언트 접근 완전 차단, 서버(service_role)만
REVOKE ALL ON public.subscription_billing FROM anon, authenticated;
GRANT ALL ON public.subscription_billing TO service_role;

ALTER TABLE public.subscription_billing ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = client default deny. service_role은 RLS 우회.

-- 기존 데이터 이관
INSERT INTO public.subscription_billing (user_id, billing_key, updated_at)
SELECT user_id, billing_key, updated_at
FROM public.subscriptions
WHERE billing_key IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
  SET billing_key = EXCLUDED.billing_key,
      updated_at = EXCLUDED.updated_at;

-- subscriptions 테이블에서 billing_key 컬럼 제거 (구조적 분리 완성)
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS billing_key;

-- activate_subscription 함수: subscription_billing 테이블에 기록하도록 갱신
CREATE OR REPLACE FUNCTION public.activate_subscription(
  _user_id uuid,
  _billing_key text,
  _period_end timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _period_end IS NULL THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;

  INSERT INTO public.subscriptions(user_id, plan, status, current_period_end)
    VALUES (_user_id, 'pro_monthly', 'active', _period_end)
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'active',
          current_period_end = _period_end,
          cancel_at_period_end = false,
          updated_at = now();

  IF _billing_key IS NOT NULL THEN
    INSERT INTO public.subscription_billing(user_id, billing_key, updated_at)
      VALUES (_user_id, _billing_key, now())
      ON CONFLICT (user_id) DO UPDATE
        SET billing_key = EXCLUDED.billing_key,
            updated_at = now();
  END IF;
END;
$$;
