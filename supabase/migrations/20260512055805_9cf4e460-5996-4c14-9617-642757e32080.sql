
-- ===== card type enum =====
DO $$ BEGIN
  CREATE TYPE public.card_type AS ENUM ('leader','character','event','stage','don');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== cards table =====
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  set_code TEXT NOT NULL,
  game public.tcg_game NOT NULL DEFAULT 'optcg',
  name TEXT NOT NULL,
  type public.card_type NOT NULL,
  colors TEXT[] NOT NULL DEFAULT '{}',
  cost INT,
  power INT,
  counter INT,
  attribute TEXT,
  effect TEXT,
  image_url TEXT,
  rarity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_set ON public.cards(set_code);
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards(game);
CREATE INDEX IF NOT EXISTS idx_cards_type ON public.cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards USING gin (to_tsvector('simple', name));

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cards readable by all"
  ON public.cards FOR SELECT USING (true);

CREATE TRIGGER trg_cards_touch
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== card_favorites =====
CREATE TABLE IF NOT EXISTS public.card_favorites (
  user_id UUID NOT NULL,
  card_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_code)
);

CREATE INDEX IF NOT EXISTS idx_card_favorites_user ON public.card_favorites(user_id);

ALTER TABLE public.card_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites select own" ON public.card_favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "favorites insert own" ON public.card_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites delete own" ON public.card_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- ===== card_reviews =====
CREATE TABLE IF NOT EXISTS public.card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  card_code TEXT NOT NULL,
  rating INT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_code)
);

CREATE INDEX IF NOT EXISTS idx_card_reviews_card ON public.card_reviews(card_code);

-- rating range via trigger (CHECK is fine here but using trigger keeps consistency with project rule)
CREATE OR REPLACE FUNCTION public.validate_card_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_card_reviews_validate
  BEFORE INSERT OR UPDATE ON public.card_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_card_review();

CREATE TRIGGER trg_card_reviews_touch
  BEFORE UPDATE ON public.card_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.card_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews readable by all" ON public.card_reviews
  FOR SELECT USING (true);
CREATE POLICY "reviews insert own" ON public.card_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews update own" ON public.card_reviews
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reviews delete own" ON public.card_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- ===== sample seed (OP12) =====
INSERT INTO public.cards (code, set_code, game, name, type, colors, cost, power, counter, attribute, effect, rarity) VALUES
  ('OP12-001','OP12','optcg','실버즈 레일리','leader',ARRAY['black'],NULL,5000,NULL,'슬래시','[활성 메인] 자신의 라이프가 1 이하라면, 이 카드는 +1000 파워를 얻는다.','L'),
  ('OP12-002','OP12','optcg','에드워드 뉴게이트','character',ARRAY['red'],5,6000,1000,'타격','[등장] 상대의 코스트 5 이하 캐릭터 1장을 KO한다.','SR'),
  ('OP12-003','OP12','optcg','크로커스','character',ARRAY['red'],2,3000,1000,'슬래시','[활성 메인] 자신의 라이프 위 1장을 자신의 손에 추가해도 된다.','C'),
  ('OP12-004','OP12','optcg','코즈키 오뎅','character',ARRAY['red'],2,3000,1000,'참격','[기동: 메인][턴 1회]자신의 라이프에서 이벤트 2장을 공개할 수 있다. 이번 턴 동안, 이 캐릭터의 파워 +2000.','UC'),
  ('OP12-005','OP12','optcg','시키','character',ARRAY['red'],8,10000,NULL,'특수','[등장] 상대의 캐릭터 1장을 손으로 되돌린다.','SR'),
  ('OP12-006','OP12','optcg','샤쿠야쿠','character',ARRAY['red'],1,2000,1000,'특수',NULL,'C'),
  ('OP12-007','OP12','optcg','샹크스','character',ARRAY['red'],2,2000,1000,'슬래시',NULL,'C'),
  ('OP12-008','OP12','optcg','샹크스','character',ARRAY['red'],4,6000,NULL,'슬래시','[등장] 자신의 라이프 1장을 손에 추가한다.','SR'),
  ('OP12-009','OP12','optcg','징베','character',ARRAY['red'],3,4000,1000,'타격',NULL,'UC'),
  ('OP12-010','OP12','optcg','더글라스 불릿','character',ARRAY['red'],6,7000,2000,'타격',NULL,'SR'),
  ('OP12-011','OP12','optcg','니코 로빈','character',ARRAY['blue'],3,4000,1000,'지력',NULL,'C'),
  ('OP12-012','OP12','optcg','몽키 D. 루피','leader',ARRAY['red'],NULL,5000,NULL,'타격','[활성 메인][턴 1회]자신의 라이프에서 1장 공개. 이벤트라면 손에 추가.','L');
