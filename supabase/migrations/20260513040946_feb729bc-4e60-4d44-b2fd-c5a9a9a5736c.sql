CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id text NOT NULL UNIQUE,
  imp_uid text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'KRW',
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;

CREATE POLICY "Users can view own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own credits"
ON public.user_credits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.process_successful_payment(
  p_user_id uuid,
  p_amount numeric,
  p_order_id text,
  p_provider text,
  p_imp_uid text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_credits_to_add integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = p_order_id AND status = 'completed'
  ) THEN
    RETURN;
  END IF;

  v_credits_to_add := floor(p_amount / 10)::integer;

  INSERT INTO public.payments (user_id, order_id, imp_uid, amount, provider, status)
  VALUES (p_user_id, p_order_id, p_imp_uid, p_amount, p_provider, 'completed')
  ON CONFLICT (order_id) DO UPDATE
  SET status = 'completed',
      imp_uid = EXCLUDED.imp_uid,
      amount = EXCLUDED.amount,
      provider = EXCLUDED.provider,
      user_id = EXCLUDED.user_id,
      updated_at = now();

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (p_user_id, v_credits_to_add)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_credits_to_add,
      updated_at = now();
END;
$$;