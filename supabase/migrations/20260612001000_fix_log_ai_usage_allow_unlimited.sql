-- ai-quota.server.ts가 보내는 source 4종(free_quota/pro/credits/unlimited)과 일치시킨다.
-- (스키마 재구성 때 'unlimited'가 누락되어 ai_unlimited 사용자의 기록이 P0001로 실패하던 버그)
CREATE OR REPLACE FUNCTION public.log_ai_usage(_user_id uuid, _feature text, _source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF _source NOT IN ('free_quota', 'pro', 'credits', 'unlimited') THEN
    RAISE EXCEPTION 'invalid source: %', _source;
  END IF;
  INSERT INTO public.ai_usage(user_id, feature, cost_credits, source)
  VALUES (_user_id, _feature, 0, _source);
END;
$function$;
