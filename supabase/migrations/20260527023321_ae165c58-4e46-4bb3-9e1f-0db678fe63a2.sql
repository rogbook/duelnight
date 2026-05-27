-- card_sets 테이블 신설: 빈 세트도 독립적으로 관리
CREATE TABLE public.card_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.card_sets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_sets TO authenticated;
GRANT ALL ON public.card_sets TO service_role;

ALTER TABLE public.card_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_sets readable by all"
  ON public.card_sets FOR SELECT
  USING (true);

CREATE POLICY "card_sets insert admin"
  ON public.card_sets FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "card_sets update admin"
  ON public.card_sets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "card_sets delete admin"
  ON public.card_sets FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_card_sets_updated_at
  BEFORE UPDATE ON public.card_sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 기존 cards.set_code distinct 값을 card_sets에 이관 (DUMMY 코드 제외한 실제 세트 포함)
INSERT INTO public.card_sets (name)
SELECT DISTINCT set_code FROM public.cards
WHERE set_code IS NOT NULL AND length(trim(set_code)) > 0
ON CONFLICT (name) DO NOTHING;

-- 기존 DUMMY 카드 33개 정리 (이제 card_sets가 빈 세트를 관리하므로 더 이상 필요 없음)
DELETE FROM public.cards WHERE code LIKE 'DUMMY-%';