-- ============================================================
-- 1) friendships (양방향 친구)
-- ============================================================
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_distinct CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_unique UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships select own"
ON public.friendships FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friendships insert own"
ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "friendships update participant"
ON public.friendships FOR UPDATE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friendships delete participant"
ON public.friendships FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER trg_friendships_touch
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 2) user_ratings (ELO)
-- ============================================================
CREATE TABLE public.user_ratings (
  user_id uuid NOT NULL,
  game public.tcg_game NOT NULL,
  rating integer NOT NULL DEFAULT 1000,
  matches_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game)
);

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings readable by all"
ON public.user_ratings FOR SELECT USING (true);

-- writes are done by SECURITY DEFINER trigger only

-- ============================================================
-- 3) matches: 컬럼 추가
-- ============================================================
ALTER TABLE public.matches
  ADD COLUMN opponent_user_id uuid,
  ADD COLUMN opponent_deck_id uuid,
  ADD COLUMN tournament_note text,
  ADD COLUMN points_delta integer,
  ADD COLUMN opponent_points_delta integer,
  ADD COLUMN pre_rating integer,
  ADD COLUMN opponent_pre_rating integer;

CREATE INDEX idx_matches_opponent_user ON public.matches(opponent_user_id);

-- 상대도 자신이 태그된 매치를 볼 수 있음
CREATE POLICY "matches opponent select"
ON public.matches FOR SELECT
USING (auth.uid() = opponent_user_id);

-- ============================================================
-- 4) 사용자 검색 함수 (친구 여부 포함)
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_users(q text, lim integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  primary_game public.tcg_game,
  friendship_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.primary_game,
    COALESCE((
      SELECT
        CASE
          WHEN f.status = 'accepted' THEN 'friend'
          WHEN f.status = 'pending' AND f.requester_id = auth.uid() THEN 'pending_out'
          WHEN f.status = 'pending' AND f.addressee_id = auth.uid() THEN 'pending_in'
          ELSE 'none'
        END
      FROM public.friendships f
      WHERE (f.requester_id = auth.uid() AND f.addressee_id = p.id)
         OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
      LIMIT 1
    ), 'none') AS friendship_status
  FROM public.profiles p
  WHERE p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      q IS NULL OR length(trim(q)) = 0
      OR p.display_name ILIKE '%' || q || '%'
      OR p.username ILIKE '%' || q || '%'
    )
  ORDER BY
    CASE WHEN p.username = q OR p.display_name = q THEN 0 ELSE 1 END,
    p.display_name NULLS LAST
  LIMIT GREATEST(1, LEAST(lim, 50));
$$;

-- ============================================================
-- 5) 상대가 자기 측 덱 정보 수정
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_opponent_match(
  _match_id uuid,
  _opp_deck text,
  _opp_leader text,
  _opp_deck_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.matches
     SET opp_deck = NULLIF(_opp_deck, ''),
         opp_leader = NULLIF(_opp_leader, ''),
         opponent_deck_id = _opp_deck_id
   WHERE id = _match_id AND opponent_user_id = caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized'; END IF;
END;
$$;

-- ============================================================
-- 6) ELO 트리거: 매치 INSERT 후 점수 갱신
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_elo_on_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k constant integer := 32;
  r_self integer;
  r_opp integer;
  expected_self numeric;
  expected_opp numeric;
  s_self numeric;
  s_opp numeric;
  delta_self integer;
  delta_opp integer;
BEGIN
  -- only if both sides identified and result is decisive (or draw)
  IF NEW.opponent_user_id IS NULL THEN RETURN NEW; END IF;

  -- ensure rating rows exist
  INSERT INTO public.user_ratings (user_id, game, rating)
    VALUES (NEW.user_id, NEW.game, 1000)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_ratings (user_id, game, rating)
    VALUES (NEW.opponent_user_id, NEW.game, 1000)
    ON CONFLICT DO NOTHING;

  SELECT rating INTO r_self FROM public.user_ratings WHERE user_id = NEW.user_id AND game = NEW.game;
  SELECT rating INTO r_opp  FROM public.user_ratings WHERE user_id = NEW.opponent_user_id AND game = NEW.game;

  expected_self := 1.0 / (1.0 + power(10.0, (r_opp - r_self)::numeric / 400.0));
  expected_opp  := 1.0 - expected_self;

  s_self := CASE NEW.result WHEN 'win' THEN 1.0 WHEN 'loss' THEN 0.0 ELSE 0.5 END;
  s_opp  := 1.0 - s_self;

  delta_self := round(k * (s_self - expected_self));
  delta_opp  := round(k * (s_opp  - expected_opp));

  UPDATE public.user_ratings
     SET rating = rating + delta_self,
         matches_count = matches_count + 1,
         updated_at = now()
   WHERE user_id = NEW.user_id AND game = NEW.game;

  UPDATE public.user_ratings
     SET rating = rating + delta_opp,
         matches_count = matches_count + 1,
         updated_at = now()
   WHERE user_id = NEW.opponent_user_id AND game = NEW.game;

  -- write back deltas (avoid recursive trigger via WHEN clause)
  UPDATE public.matches
     SET pre_rating = r_self,
         opponent_pre_rating = r_opp,
         points_delta = delta_self,
         opponent_points_delta = delta_opp
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_elo_after_insert
AFTER INSERT ON public.matches
FOR EACH ROW
WHEN (NEW.opponent_user_id IS NOT NULL AND NEW.points_delta IS NULL)
EXECUTE FUNCTION public.apply_elo_on_match();
