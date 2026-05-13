
-- 1) status enum + 컬럼 추가
DO $$ BEGIN
  CREATE TYPE public.card_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS status public.card_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_cards_status ON public.cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_submitted_by ON public.cards(submitted_by);

-- 2) RLS 재정의 — 승인 안 된 카드는 일반에게 안 보이게
DROP POLICY IF EXISTS "cards readable by all" ON public.cards;
DROP POLICY IF EXISTS "cards user insert" ON public.cards;

CREATE POLICY "cards select visible"
  ON public.cards FOR SELECT
  USING (
    status = 'approved'
    OR submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "cards user insert pending"
  ON public.cards FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND submitted_by = auth.uid()
    AND status = 'pending'
  );

-- 3) 감사 로그 테이블
CREATE TABLE IF NOT EXISTS public.card_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid,
  card_code text NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_audit_card ON public.card_audit_logs(card_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_audit_action ON public.card_audit_logs(action, created_at DESC);

ALTER TABLE public.card_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit admin select" ON public.card_audit_logs;
CREATE POLICY "audit admin select"
  ON public.card_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) 트리거 함수
CREATE OR REPLACE FUNCTION public.log_card_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.card_audit_logs (card_id, card_code, action, actor_id, after_data)
    VALUES (NEW.id, NEW.code, 'created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    act := 'updated';
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      act := CASE NEW.status::text
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'updated'
      END;
    END IF;
    INSERT INTO public.card_audit_logs (card_id, card_code, action, actor_id, before_data, after_data)
    VALUES (NEW.id, NEW.code, act, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.card_audit_logs (card_id, card_code, action, actor_id, before_data)
    VALUES (OLD.id, OLD.code, 'deleted', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS cards_audit ON public.cards;
CREATE TRIGGER cards_audit
AFTER INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.log_card_change();

-- 5) 검수 RPC (관리자 전용)
CREATE OR REPLACE FUNCTION public.review_card(_code text, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.cards
     SET status = CASE WHEN _approve THEN 'approved'::card_status ELSE 'rejected'::card_status END,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = _note,
         updated_at = now()
   WHERE code = _code;
END $$;
