-- 덱에 색상(타입) 다중 선택 저장
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}';

-- 덱 레시피 (덱-카드 연결, 수량)
CREATE TABLE IF NOT EXISTS public.deck_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, card_code)
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON public.deck_cards(deck_id);

ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- 공개 덱이거나 본인 덱일 때만 카드 조회
CREATE POLICY "deck_cards select via deck visibility"
ON public.deck_cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = deck_cards.deck_id
      AND (d.is_public OR d.user_id = auth.uid())
  )
);

CREATE POLICY "deck_cards insert own deck"
ON public.deck_cards
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = deck_cards.deck_id AND d.user_id = auth.uid()
  )
);

CREATE POLICY "deck_cards update own deck"
ON public.deck_cards
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = deck_cards.deck_id AND d.user_id = auth.uid()
  )
);

CREATE POLICY "deck_cards delete own deck"
ON public.deck_cards
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = deck_cards.deck_id AND d.user_id = auth.uid()
  )
);

-- 수량 검증
CREATE OR REPLACE FUNCTION public.validate_deck_card_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity < 1 OR NEW.quantity > 99 THEN
    RAISE EXCEPTION 'quantity must be between 1 and 99';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_deck_card_quantity ON public.deck_cards;
CREATE TRIGGER trg_validate_deck_card_quantity
BEFORE INSERT OR UPDATE ON public.deck_cards
FOR EACH ROW EXECUTE FUNCTION public.validate_deck_card_quantity();