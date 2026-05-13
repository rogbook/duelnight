
CREATE OR REPLACE FUNCTION public.notify_card_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_title text;
  msg_body text;
BEGIN
  IF NEW.submitted_by IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved'::card_status THEN
    msg_title := '카드 승인됨: ' || NEW.name || ' (' || NEW.code || ')';
    msg_body := COALESCE(NEW.review_note, '검수가 승인되어 카드 DB에 공개되었습니다.');
  ELSIF NEW.status = 'rejected'::card_status THEN
    msg_title := '카드 반려됨: ' || NEW.name || ' (' || NEW.code || ')';
    msg_body := COALESCE(NEW.review_note, '검수에서 반려되었습니다. 정보를 확인 후 재제출해주세요.');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.submitted_by,
    'card_' || NEW.status::text,
    msg_title,
    msg_body,
    '/cards/' || NEW.code
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_card_review ON public.cards;
CREATE TRIGGER trg_notify_card_review
AFTER UPDATE OF status ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.notify_card_review();
