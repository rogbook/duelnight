-- =============================================================
-- Phase 3: leaderboard, LFG, stores, calendar
-- =============================================================

-- LFG (Looking For Game) posts -------------------------------
CREATE TABLE public.lfg_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game public.tcg_game NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  meet_at TIMESTAMPTZ,
  contact TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lfg_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfg readable by all"
  ON public.lfg_posts FOR SELECT TO public USING (true);
CREATE POLICY "lfg insert own"
  ON public.lfg_posts FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lfg update own"
  ON public.lfg_posts FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "lfg delete own"
  ON public.lfg_posts FOR DELETE TO public USING (auth.uid() = user_id);

CREATE TRIGGER lfg_touch_updated
  BEFORE UPDATE ON public.lfg_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- TCG stores --------------------------------------------------
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  address TEXT,
  games public.tcg_game[] NOT NULL DEFAULT '{}',
  phone TEXT,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores readable by all"
  ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "stores insert own"
  ON public.stores FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stores update own"
  ON public.stores FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "stores delete own"
  ON public.stores FOR DELETE TO public USING (auth.uid() = user_id);

CREATE TRIGGER stores_touch_updated
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tournament / event calendar --------------------------------
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game public.tcg_game NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events readable by all"
  ON public.events FOR SELECT TO public USING (true);
CREATE POLICY "events insert own"
  ON public.events FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "events update own"
  ON public.events FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "events delete own"
  ON public.events FOR DELETE TO public USING (auth.uid() = user_id);

CREATE TRIGGER events_touch_updated
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Public leaderboard aggregation -----------------------------
-- SECURITY DEFINER aggregates so callers cannot read individual rows
-- of other users' matches. Min sample size enforced server-side.
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_game public.tcg_game DEFAULT NULL,
  p_days INT DEFAULT NULL,
  p_min_total INT DEFAULT 5,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  total INT,
  wins INT,
  losses INT,
  draws INT,
  win_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      m.user_id,
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE m.result = 'win')::INT AS wins,
      COUNT(*) FILTER (WHERE m.result = 'loss')::INT AS losses,
      COUNT(*) FILTER (WHERE m.result = 'draw')::INT AS draws
    FROM public.matches m
    WHERE
      (p_game IS NULL OR m.game = p_game)
      AND (p_days IS NULL OR m.played_at >= now() - (p_days || ' days')::interval)
    GROUP BY m.user_id
  )
  SELECT
    a.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    a.total,
    a.wins,
    a.losses,
    a.draws,
    CASE WHEN (a.wins + a.losses) = 0
      THEN 0::NUMERIC
      ELSE round(a.wins::NUMERIC / (a.wins + a.losses) * 1000) / 10
    END AS win_rate
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.total >= GREATEST(1, COALESCE(p_min_total, 5))
  ORDER BY win_rate DESC, a.total DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(public.tcg_game, INT, INT, INT) TO anon, authenticated;