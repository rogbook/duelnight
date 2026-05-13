
-- Rebuild leaderboard to rank by per-game ELO rating from user_ratings
DROP FUNCTION IF EXISTS public.get_leaderboard(tcg_game, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_game tcg_game,
  p_min_total integer DEFAULT 5,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  rating integer,
  total integer,
  wins integer,
  losses integer,
  draws integer,
  win_rate numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT
      m.user_id,
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE m.result = 'win')::INT AS wins,
      COUNT(*) FILTER (WHERE m.result = 'loss')::INT AS losses,
      COUNT(*) FILTER (WHERE m.result = 'draw')::INT AS draws
    FROM public.matches m
    WHERE m.game = p_game
    GROUP BY m.user_id
  )
  SELECT
    ur.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    ur.rating,
    COALESCE(a.total, 0) AS total,
    COALESCE(a.wins, 0) AS wins,
    COALESCE(a.losses, 0) AS losses,
    COALESCE(a.draws, 0) AS draws,
    CASE WHEN COALESCE(a.wins + a.losses, 0) = 0
      THEN 0::NUMERIC
      ELSE round(a.wins::NUMERIC / (a.wins + a.losses) * 1000) / 10
    END AS win_rate
  FROM public.user_ratings ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN agg a ON a.user_id = ur.user_id
  WHERE ur.game = p_game
    AND COALESCE(a.total, 0) >= GREATEST(1, COALESCE(p_min_total, 5))
  ORDER BY ur.rating DESC, COALESCE(a.total, 0) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- Public RPC to fetch any user's recent match history for a given game (read-only)
CREATE OR REPLACE FUNCTION public.get_user_recent_matches(
  p_user_id uuid,
  p_game tcg_game,
  p_limit integer DEFAULT 15
)
RETURNS TABLE(
  id uuid,
  played_at timestamptz,
  game tcg_game,
  my_deck text,
  opp_leader text,
  opp_deck text,
  result match_result,
  went_first boolean,
  points_delta integer,
  event match_event
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.played_at, m.game, m.my_deck, m.opp_leader, m.opp_deck,
         m.result, m.went_first, m.points_delta, m.event
  FROM public.matches m
  WHERE m.user_id = p_user_id
    AND m.game = p_game
  ORDER BY m.played_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 15), 50));
$$;
