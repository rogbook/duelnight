-- 동일 카드의 다른 일러스트(얼터아트/패러랠/프로모 등)를 허용하기 위해
-- card_illustrations 테이블을 분리하고 기존 cards.image_url을 백필합니다.

CREATE TABLE IF NOT EXISTS public.card_illustrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_code text NOT NULL REFERENCES public.cards(code) ON DELETE CASCADE ON UPDATE CASCADE,
  image_url text NOT NULL,
  variant_label text,
  is_primary boolean NOT NULL DEFAULT false,
  status public.card_status NOT NULL DEFAULT 'pending',
  submitted_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_illustrations_code_url_unique
  ON public.card_illustrations (card_code, image_url);

-- 카드별 primary 1장 제약
CREATE UNIQUE INDEX IF NOT EXISTS card_illustrations_one_primary
  ON public.card_illustrations (card_code) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS card_illustrations_card_code_idx
  ON public.card_illustrations (card_code);
CREATE INDEX IF NOT EXISTS card_illustrations_status_idx
  ON public.card_illustrations (status);
CREATE INDEX IF NOT EXISTS card_illustrations_submitted_by_idx
  ON public.card_illustrations (submitted_by);

-- updated_at 트리거 (기존 touch_updated_at 함수 재사용)
DROP TRIGGER IF EXISTS card_illustrations_touch_updated_at ON public.card_illustrations;
CREATE TRIGGER card_illustrations_touch_updated_at
  BEFORE UPDATE ON public.card_illustrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.card_illustrations ENABLE ROW LEVEL SECURITY;

-- 승인된 일러스트는 모두 조회 가능 + 본인 제출분 + 관리자
CREATE POLICY "illust select visible"
  ON public.card_illustrations FOR SELECT
  USING (
    status = 'approved'
    OR submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- 일반 사용자는 본인 명의로 pending 상태로만 등록
CREATE POLICY "illust user insert pending"
  ON public.card_illustrations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND submitted_by = auth.uid()
    AND status = 'pending'
  );

-- 관리자는 모든 권한
CREATE POLICY "illust admin insert"
  ON public.card_illustrations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "illust admin update"
  ON public.card_illustrations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "illust admin delete"
  ON public.card_illustrations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 본인이 올린 pending 일러스트는 본인이 삭제 가능 (실수 정정용)
CREATE POLICY "illust user delete own pending"
  ON public.card_illustrations FOR DELETE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending');

-- 기존 cards.image_url 백필
INSERT INTO public.card_illustrations (card_code, image_url, is_primary, status, submitted_by, reviewed_by, reviewed_at)
SELECT c.code, c.image_url, true, c.status, c.submitted_by, c.reviewed_by, c.reviewed_at
FROM public.cards c
WHERE c.image_url IS NOT NULL AND c.image_url <> ''
ON CONFLICT (card_code, image_url) DO NOTHING;

-- 카드 일러스트 검수 결과 알림 트리거
CREATE OR REPLACE FUNCTION public.notify_illust_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  msg_title text;
  msg_body text;
BEGIN
  IF NEW.submitted_by IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'approved'::card_status THEN
    msg_title := '추가 일러스트 승인됨: ' || NEW.card_code;
    msg_body := COALESCE(NEW.review_note, '검수가 승인되어 카드 갤러리에 공개되었습니다.');
  ELSIF NEW.status = 'rejected'::card_status THEN
    msg_title := '추가 일러스트 반려됨: ' || NEW.card_code;
    msg_body := COALESCE(NEW.review_note, '검수에서 반려되었습니다.');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.submitted_by, 'illust_' || NEW.status::text, msg_title, msg_body, '/cards/' || NEW.card_code);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS card_illustrations_notify_review ON public.card_illustrations;
CREATE TRIGGER card_illustrations_notify_review
  AFTER UPDATE ON public.card_illustrations
  FOR EACH ROW EXECUTE FUNCTION public.notify_illust_review();