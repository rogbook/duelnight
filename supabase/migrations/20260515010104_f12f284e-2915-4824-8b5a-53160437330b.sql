CREATE OR REPLACE FUNCTION public.log_ai_usage(_user_id uuid, _feature text, _source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF _source NOT IN ('free_quota', 'pro', 'credits') THEN
    RAISE EXCEPTION 'invalid source: %', _source;
  END IF;
  INSERT INTO public.ai_usage(user_id, feature, cost_credits, source)
  VALUES (_user_id, _feature, 0, _source);
END;
$$;