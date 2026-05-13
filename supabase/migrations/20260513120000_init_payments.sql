-- supabase/migrations/20260513120000_init_payments.sql

-- 1. 결제 내역 테이블 생성
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    order_id TEXT UNIQUE NOT NULL,           -- 내부 주문 번호
    imp_uid TEXT,                            -- PortOne 결제 고유 번호
    amount NUMERIC NOT NULL,                 -- 결제 금액
    currency TEXT NOT NULL DEFAULT 'KRW',    -- 통화
    provider TEXT NOT NULL,                  -- portone, paypal
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, completed, failed, cancelled
    receipt_url TEXT,                        -- 결제 영수증 URL
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 사용자 크레딧 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_credits (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    balance INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS 설정
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own credits" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);

-- 4. 결제 처리 함수 (Security Definer로 권한 상승하여 처리)
CREATE OR REPLACE FUNCTION process_successful_payment(
    p_user_id UUID,
    p_amount NUMERIC,
    p_order_id TEXT,
    p_provider TEXT,
    p_imp_uid TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_credits_to_add INTEGER;
BEGIN
    -- 1. 중복 처리 방지 (이미 완료된 결제인지 확인)
    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'completed') THEN
        RETURN;
    END IF;

    -- 2. 금액에 따른 크레딧 계산
    v_credits_to_add := FLOOR(p_amount / 10);

    -- 3. 결제 내역 저장 또는 업데이트
    INSERT INTO public.payments (user_id, order_id, imp_uid, amount, provider, status)
    VALUES (p_user_id, p_order_id, p_imp_uid, p_amount, p_provider, 'completed')
    ON CONFLICT (order_id) DO UPDATE 
    SET status = 'completed', 
        imp_uid = EXCLUDED.imp_uid,
        updated_at = now();

    -- 4. 사용자 크레딧 업데이트
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, v_credits_to_add)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + v_credits_to_add,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
