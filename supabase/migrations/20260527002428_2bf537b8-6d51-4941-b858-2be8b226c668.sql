
-- 1) LFG contact/kakao_link column-level restriction
REVOKE SELECT (contact, kakao_link) ON public.lfg_posts FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_lfg_contact(_post_id uuid)
RETURNS TABLE(contact text, kakao_link text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  owner uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  SELECT user_id INTO owner FROM public.lfg_posts WHERE id = _post_id;
  IF owner IS NULL THEN
    RETURN;
  END IF;
  IF owner = caller
     OR EXISTS (
       SELECT 1 FROM public.lfg_participants
       WHERE post_id = _post_id AND user_id = caller AND status = 'accepted'
     ) THEN
    RETURN QUERY
      SELECT p.contact, p.kakao_link FROM public.lfg_posts p WHERE p.id = _post_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lfg_contact(uuid) TO authenticated;

-- 2) subscriptions.billing_key column-level restriction (server-only)
REVOKE SELECT (billing_key) ON public.subscriptions FROM authenticated, anon;

-- 3) OAuth state nonces for CSRF protection on Google Drive callback
CREATE TABLE IF NOT EXISTS public.oauth_states (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

GRANT ALL ON public.oauth_states TO service_role;

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: clients cannot read/write; only service_role (server-side) bypasses RLS.

CREATE INDEX IF NOT EXISTS oauth_states_user_idx ON public.oauth_states(user_id);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON public.oauth_states(expires_at);
