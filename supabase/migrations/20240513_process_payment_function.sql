-- supabase/migrations/20240513_process_payment_function.sql

CREATE OR REPLACE FUNCTION process_successful_payment(
    p_user_id UUID,
    p_amount NUMERIC,
    p_order_id TEXT,
    p_provider TEXT
) RETURNS VOID AS $$
DECLARE
    v_credits_to_add INTEGER;
BEGIN
    -- 1. 결제 내역 확인 (중복 처리 방지)
    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'completed') THEN
        RETURN;
    END IF;

    -- 2. 금액에 따른 크레딧 계산 (예: 10원당 1크레딧)
    v_credits_to_add := FLOOR(p_amount / 10);

    -- 3. 결제 내역 저장 또는 업데이트
    INSERT INTO public.payments (user_id, order_id, amount, provider, status)
    VALUES (p_user_id, p_order_id, p_amount, p_provider, 'completed')
    ON CONFLICT (order_id) DO UPDATE 
    SET status = 'completed', updated_at = now();

    -- 4. 사용자 크레딧 업데이트
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, v_credits_to_add)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + v_credits_to_add,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
