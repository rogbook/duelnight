
CREATE OR REPLACE FUNCTION public.claim_admin_if_none()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'admin already exists';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.grant_admin_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  target uuid;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF target IS NULL THEN
    RAISE EXCEPTION 'user not found: %', _email;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN target;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_admin_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  target uuid;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF target IS NULL THEN
    RAISE EXCEPTION 'user not found: %', _email;
  END IF;
  IF target = caller THEN
    RAISE EXCEPTION 'cannot revoke yourself';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = target AND role = 'admin';
  RETURN target;
END $$;

CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE(user_id uuid, email text, display_name text, granted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT ur.user_id, u.email::text, p.display_name, ur.created_at
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'
    ORDER BY ur.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.any_admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
