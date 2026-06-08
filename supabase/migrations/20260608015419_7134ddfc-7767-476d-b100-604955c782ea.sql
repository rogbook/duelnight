-- 1) cards.effects: 카드 효과 DSL JSON 배열
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS effects jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) simulator_decks 테이블 신설
CREATE TABLE IF NOT EXISTS public.simulator_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game text NOT NULL,
  name text NOT NULL,
  recipe jsonb NOT NULL DEFAULT '[]'::jsonb,
  leader_code text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS simulator_decks_user_id_idx ON public.simulator_decks(user_id);
CREATE INDEX IF NOT EXISTS simulator_decks_game_idx ON public.simulator_decks(game);
CREATE INDEX IF NOT EXISTS simulator_decks_public_idx ON public.simulator_decks(is_public) WHERE is_public = true;

-- 3) GRANT (RLS 이전에 반드시)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulator_decks TO authenticated;
GRANT ALL ON public.simulator_decks TO service_role;
-- anon: 공개 덱 열람 허용
GRANT SELECT ON public.simulator_decks TO anon;

-- 4) RLS 활성화
ALTER TABLE public.simulator_decks ENABLE ROW LEVEL SECURITY;

-- 5) 정책
-- 본인 덱 전체 CRUD
CREATE POLICY "Users can manage their own simulator decks"
  ON public.simulator_decks
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 공개 덱 누구나 SELECT (비로그인 포함)
CREATE POLICY "Anyone can view public simulator decks"
  ON public.simulator_decks
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- 6) updated_at 자동 갱신 트리거 (기존 함수 재사용 시도, 없으면 생성)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_simulator_decks_updated_at ON public.simulator_decks;
CREATE TRIGGER update_simulator_decks_updated_at
  BEFORE UPDATE ON public.simulator_decks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();