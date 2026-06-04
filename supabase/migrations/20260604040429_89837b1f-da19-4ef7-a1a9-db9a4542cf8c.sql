
-- 1. games 테이블
CREATE TABLE public.games (
  code TEXT PRIMARY KEY,
  label_ko TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_ja TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.games TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games readable by all" ON public.games FOR SELECT USING (true);
CREATE POLICY "games insert admin" ON public.games FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "games update admin" ON public.games FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "games delete admin" ON public.games FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_games_updated_at BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. 기본 게임 시드
INSERT INTO public.games (code, label_ko, label_en, label_ja, sort_order, is_builtin) VALUES
  ('optcg', '원피스', 'One Piece', 'ワンピース', 10, true),
  ('ptcg', '포켓몬', 'Pokemon', 'ポケモン', 20, true),
  ('dtcg', '디지몬', 'Digimon', 'デジモン', 30, true)
ON CONFLICT (code) DO NOTHING;

-- 3. card_sets에 game 컬럼 추가
ALTER TABLE public.card_sets ADD COLUMN IF NOT EXISTS game TEXT;
UPDATE public.card_sets SET game = 'optcg' WHERE game IS NULL;
ALTER TABLE public.card_sets ALTER COLUMN game SET NOT NULL;
ALTER TABLE public.card_sets ALTER COLUMN game SET DEFAULT 'optcg';

-- name 단독 unique를 (game, name) 복합 unique로 교체
ALTER TABLE public.card_sets DROP CONSTRAINT IF EXISTS card_sets_name_key;
ALTER TABLE public.card_sets ADD CONSTRAINT card_sets_game_name_key UNIQUE (game, name);

CREATE INDEX IF NOT EXISTS card_sets_game_idx ON public.card_sets(game);
