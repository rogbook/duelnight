-- 관리자 회원관리·요금관리 RPC 5종 (docs/ADMIN_PAGES_PLAN.md)
-- 기존 list_admins 관례: SECURITY DEFINER + 내부 admin 검증(has_role)

CREATE OR REPLACE FUNCTION public.admin_list_members(_search text DEFAULT NULL, _limit int DEFAULT 20, _offset int DEFAULT 0)
RETURNS TABLE(
  user_id uuid, email text, display_name text, username text,
  created_at timestamptz, last_sign_in_at timestamptz,
  is_admin boolean, banned boolean, credit_balance int,
  plan text, sub_status text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.display_name, p.username,
      u.created_at, u.last_sign_in_at,
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
      (u.banned_until IS NOT NULL AND u.banned_until > now()),
      COALESCE(uc.balance, 0),
      s.plan, s.status::text,
      count(*) OVER ()
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_credits uc ON uc.user_id = u.id
    LEFT JOIN public.subscriptions s ON s.user_id = u.id
    WHERE _search IS NULL OR _search = ''
      OR u.email ILIKE '%' || _search || '%'
      OR p.display_name ILIKE '%' || _search || '%'
      OR p.username ILIKE '%' || _search || '%'
    ORDER BY u.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 100)) OFFSET GREATEST(0, _offset);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot ban yourself';
  END IF;
  IF _banned AND public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'cannot ban another admin';
  END IF;
  UPDATE auth.users
  SET banned_until = CASE WHEN _banned THEN 'infinity'::timestamptz ELSE NULL END
  WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id uuid, _delta int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _delta = 0 OR abs(_delta) > 100000 THEN
    RAISE EXCEPTION 'delta must be within ±100000 and non-zero';
  END IF;
  INSERT INTO public.user_credits(user_id, balance)
  VALUES (_user_id, GREATEST(0, _delta))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = GREATEST(0, public.user_credits.balance + _delta), updated_at = now()
  RETURNING balance INTO new_balance;
  RETURN new_balance;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_payments(_limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE(
  id uuid, email text, order_id text, amount numeric, currency text,
  provider text, status text, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT pay.id, u.email::text, pay.order_id, pay.amount, pay.currency,
      pay.provider, pay.status, pay.created_at, count(*) OVER ()
    FROM public.payments pay
    LEFT JOIN auth.users u ON u.id = pay.user_id
    ORDER BY pay.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 200)) OFFSET GREATEST(0, _offset);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions()
RETURNS TABLE(
  user_id uuid, email text, plan text, status text,
  started_at timestamptz, current_period_end timestamptz, cancel_at_period_end boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT s.user_id, u.email::text, s.plan, s.status::text,
      s.started_at, s.current_period_end, s.cancel_at_period_end
    FROM public.subscriptions s
    LEFT JOIN auth.users u ON u.id = s.user_id
    ORDER BY s.started_at DESC;
END $$;

-- 클라이언트(authenticated)에서 RPC 호출 가능하도록 (내부에서 admin 재검증)
GRANT EXECUTE ON FUNCTION public.admin_list_members(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_subscriptions() TO authenticated;
