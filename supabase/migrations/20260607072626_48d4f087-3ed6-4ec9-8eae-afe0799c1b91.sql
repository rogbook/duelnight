
DROP FUNCTION IF EXISTS public.get_leaderboard(tcg_game, integer, integer);
DROP FUNCTION IF EXISTS public.get_user_recent_matches(uuid, tcg_game, integer);
DROP FUNCTION IF EXISTS public.search_users(text, integer);

ALTER TABLE public.cards         ALTER COLUMN game DROP DEFAULT;
ALTER TABLE public.cards         ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.cards         ALTER COLUMN game SET DEFAULT 'optcg';

ALTER TABLE public.tier_lists    ALTER COLUMN game DROP DEFAULT;
ALTER TABLE public.tier_lists    ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.tier_lists    ALTER COLUMN game SET DEFAULT 'optcg';

ALTER TABLE public.decks         ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.events        ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.lfg_posts     ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.matches       ALTER COLUMN game TYPE text USING game::text;
ALTER TABLE public.profiles      ALTER COLUMN primary_game TYPE text USING primary_game::text;
ALTER TABLE public.user_ratings  ALTER COLUMN game TYPE text USING game::text;

ALTER TABLE public.stores        ALTER COLUMN games DROP DEFAULT;
ALTER TABLE public.stores        ALTER COLUMN games TYPE text[] USING games::text[];
ALTER TABLE public.stores        ALTER COLUMN games SET DEFAULT '{}'::text[];

DROP TYPE public.tcg_game;

CREATE OR REPLACE FUNCTION public.get_user_recent_matches(p_user_id uuid, p_game text, p_limit integer DEFAULT 15)
RETURNS TABLE(id uuid, played_at timestamp with time zone, game text, my_deck text, opp_leader text, opp_deck text, result match_result, went_first boolean, points_delta integer, event match_event)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT m.id, m.played_at, m.game, m.my_deck, m.opp_leader, m.opp_deck,
         m.result, m.went_first, m.points_delta, m.event
  FROM public.matches m
  WHERE m.user_id = p_user_id AND m.game = p_game
  ORDER BY m.played_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 15), 50));
$function$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_game text, p_min_total integer DEFAULT 5, p_limit integer DEFAULT 50)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, rating integer, total integer, wins integer, losses integer, draws integer, win_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT m.user_id,
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE m.result = 'win')::INT AS wins,
      COUNT(*) FILTER (WHERE m.result = 'loss')::INT AS losses,
      COUNT(*) FILTER (WHERE m.result = 'draw')::INT AS draws
    FROM public.matches m WHERE m.game = p_game GROUP BY m.user_id
  )
  SELECT ur.user_id, p.display_name, p.username, p.avatar_url, ur.rating,
    COALESCE(a.total, 0), COALESCE(a.wins, 0), COALESCE(a.losses, 0), COALESCE(a.draws, 0),
    CASE WHEN COALESCE(a.wins + a.losses, 0) = 0 THEN 0::NUMERIC
      ELSE round(a.wins::NUMERIC / (a.wins + a.losses) * 1000) / 10 END
  FROM public.user_ratings ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN agg a ON a.user_id = ur.user_id
  WHERE ur.game = p_game AND COALESCE(a.total, 0) >= GREATEST(1, COALESCE(p_min_total, 5))
  ORDER BY ur.rating DESC, COALESCE(a.total, 0) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$function$;

CREATE OR REPLACE FUNCTION public.search_users(q text, lim integer DEFAULT 20)
RETURNS TABLE(id uuid, display_name text, username text, avatar_url text, primary_game text, friendship_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.primary_game,
    COALESCE((
      SELECT CASE
          WHEN f.status = 'accepted' THEN 'friend'
          WHEN f.status = 'pending' AND f.requester_id = auth.uid() THEN 'pending_out'
          WHEN f.status = 'pending' AND f.addressee_id = auth.uid() THEN 'pending_in'
          ELSE 'none' END
      FROM public.friendships f
      WHERE (f.requester_id = auth.uid() AND f.addressee_id = p.id)
         OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
      LIMIT 1
    ), 'none')
  FROM public.profiles p
  WHERE p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND (q IS NULL OR length(trim(q)) = 0
      OR p.display_name ILIKE '%' || q || '%'
      OR p.username ILIKE '%' || q || '%')
  ORDER BY CASE WHEN p.username = q OR p.display_name = q THEN 0 ELSE 1 END,
    p.display_name NULLS LAST
  LIMIT GREATEST(1, LEAST(lim, 50));
$function$;
