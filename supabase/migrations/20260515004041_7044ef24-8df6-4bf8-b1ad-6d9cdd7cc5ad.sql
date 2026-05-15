
-- ============================================================
-- 1. subscriptions 테이블 (Pro 멤버십)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active','canceled','expired','trialing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'pro_monthly',
  status subscription_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  billing_key text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs select own"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "subs admin select"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER subs_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);

-- ============================================================
-- 2. ai_usage 테이블 (AI 사용량 추적)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,            -- 'ocr' | 'coach'
  used_at timestamptz NOT NULL DEFAULT now(),
  cost_credits int NOT NULL DEFAULT 0,
  source text NOT NULL              -- 'free_quota' | 'credits' | 'pro'
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage select own"
  ON public.ai_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_usage admin select"
  ON public.ai_usage FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_feature_time ON public.ai_usage(user_id, feature, used_at DESC);

-- ============================================================
-- 3. payments 테이블 확장
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'credits_topup';

CREATE INDEX IF NOT EXISTS idx_payments_user_created ON public.payments(user_id, created_at DESC);

-- ============================================================
-- 4. user_credits 테이블 확장
-- ============================================================
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS lifetime_purchased int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_used int NOT NULL DEFAULT 0;

-- ============================================================
-- 5. 서버 함수 4종
-- ============================================================

-- 5-1. 무료 한도 체크
CREATE OR REPLACE FUNCTION public.check_free_quota(_user_id uuid, _feature text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used int;
  v_limit int;
  v_window text;
  v_is_pro boolean;
BEGIN
  -- Pro 구독자는 무제한
  SELECT EXISTS(
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND current_period_end > now()
  ) INTO v_is_pro;

  IF v_is_pro THEN
    RETURN jsonb_build_object('allowed', true, 'source', 'pro', 'remaining', -1);
  END IF;

  -- feature별 한도/주기
  IF _feature = 'ocr' THEN
    v_limit := 5;
    v_window := 'day';
  ELSIF _feature = 'coach' THEN
    v_limit := 3;
    v_window := 'month';
  ELSE
    RETURN jsonb_build_object('allowed', false, 'source', 'unknown', 'remaining', 0);
  END IF;

  -- 사용량 집계
  IF v_window = 'day' THEN
    SELECT COUNT(*)::int INTO v_used
      FROM public.ai_usage
      WHERE user_id = _user_id
        AND feature = _feature
        AND source = 'free_quota'
        AND used_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
  ELSE
    SELECT COUNT(*)::int INTO v_used
      FROM public.ai_usage
      WHERE user_id = _user_id
        AND feature = _feature
        AND source = 'free_quota'
        AND used_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'source', 'free_quota',
    'remaining', GREATEST(0, v_limit - v_used),
    'limit', v_limit,
    'window', v_window
  );
END;
$$;

-- 5-2. 크레딧 차감
CREATE OR REPLACE FUNCTION public.consume_credits(_user_id uuid, _amount int, _feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance int;
BEGIN
  IF _user_id IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;

  SELECT balance INTO v_balance
    FROM public.user_credits
    WHERE user_id = _user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_credits(user_id, balance) VALUES (_user_id, 0);
    v_balance := 0;
  END IF;

  IF v_balance < _amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance);
  END IF;

  UPDATE public.user_credits
    SET balance = balance - _amount,
        lifetime_used = lifetime_used + _amount,
        updated_at = now()
    WHERE user_id = _user_id;

  INSERT INTO public.ai_usage(user_id, feature, cost_credits, source)
    VALUES (_user_id, _feature, _amount, 'credits');

  RETURN jsonb_build_object('ok', true, 'balance', v_balance - _amount);
END;
$$;

-- 5-3. 결제 후 크레딧 충전
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount int, _payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;

  INSERT INTO public.user_credits(user_id, balance, lifetime_purchased)
    VALUES (_user_id, _amount, _amount)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.user_credits.balance + _amount,
          lifetime_purchased = public.user_credits.lifetime_purchased + _amount,
          updated_at = now();
END;
$$;

-- 5-4. Pro 구독 활성화
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

  INSERT INTO public.subscriptions(user_id, plan, status, current_period_end, billing_key)
    VALUES (_user_id, 'pro_monthly', 'active', _period_end, _billing_key)
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'active',
          current_period_end = _period_end,
          billing_key = COALESCE(_billing_key, public.subscriptions.billing_key),
          cancel_at_period_end = false,
          updated_at = now();
END;
$$;

-- 5-5. user_credits 행 자동 생성 (신규 가입자)
CREATE OR REPLACE FUNCTION public.ensure_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits(user_id, balance) VALUES (NEW.id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_credits_on_profile ON public.profiles;
CREATE TRIGGER ensure_credits_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_credits();

-- ============================================================
-- 6. 결제 완료 함수 갱신 (구독/크레딧 분기)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_successful_payment(
  p_user_id uuid,
  p_amount numeric,
  p_order_id text,
  p_provider text,
  p_imp_uid text DEFAULT NULL,
  p_purpose text DEFAULT 'credits_topup',
  p_credits int DEFAULT NULL,
  p_period_days int DEFAULT 30,
  p_billing_key text DEFAULT NULL,
  p_mode text DEFAULT 'test'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_credits_to_add int;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- 중복 처리 방지
  SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id AND status = 'completed'
    LIMIT 1;
  IF v_payment_id IS NOT NULL THEN
    RETURN v_payment_id;
  END IF;

  INSERT INTO public.payments (user_id, order_id, imp_uid, amount, provider, status, mode, purpose)
    VALUES (p_user_id, p_order_id, p_imp_uid, p_amount, p_provider, 'completed', p_mode, p_purpose)
    ON CONFLICT (order_id) DO UPDATE
      SET status = 'completed',
          imp_uid = EXCLUDED.imp_uid,
          amount = EXCLUDED.amount,
          provider = EXCLUDED.provider,
          user_id = EXCLUDED.user_id,
          mode = EXCLUDED.mode,
          purpose = EXCLUDED.purpose,
          updated_at = now()
    RETURNING id INTO v_payment_id;

  IF p_purpose = 'credits_topup' THEN
    v_credits_to_add := COALESCE(p_credits, floor(p_amount / 10)::int);
    PERFORM public.grant_credits(p_user_id, v_credits_to_add, v_payment_id);
  ELSIF p_purpose = 'pro_subscribe' THEN
    PERFORM public.activate_subscription(
      p_user_id,
      p_billing_key,
      now() + make_interval(days => p_period_days)
    );
  END IF;

  RETURN v_payment_id;
END;
$$;
