-- 댓글 신고 테이블
CREATE TABLE public.lfg_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.lfg_comments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_id)
);

CREATE INDEX idx_lfg_comment_reports_comment ON public.lfg_comment_reports(comment_id);
CREATE INDEX idx_lfg_comment_reports_status ON public.lfg_comment_reports(status);

ALTER TABLE public.lfg_comment_reports ENABLE ROW LEVEL SECURITY;

-- 본인 신고 등록
CREATE POLICY "report insert own"
ON public.lfg_comment_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_id);

-- 본인 신고 조회 + 관리자 전체 조회
CREATE POLICY "report select own or admin"
ON public.lfg_comment_reports FOR SELECT
TO authenticated
USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

-- 관리자만 상태 업데이트
CREATE POLICY "report update admin"
ON public.lfg_comment_reports FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 관리자만 삭제
CREATE POLICY "report delete admin"
ON public.lfg_comment_reports FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at 트리거
CREATE TRIGGER trg_lfg_comment_reports_updated_at
BEFORE UPDATE ON public.lfg_comment_reports
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 신고 시 관리자에게 알림
CREATE OR REPLACE FUNCTION public.notify_lfg_comment_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  preview text;
BEGIN
  SELECT left(c.body, 80) INTO preview FROM public.lfg_comments c WHERE c.id = NEW.comment_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'lfg_comment_report', '댓글 신고 접수', COALESCE(preview, ''), '/admin/reports'
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
  RETURN NEW;
END $$;

CREATE TRIGGER trg_lfg_comment_reports_notify
AFTER INSERT ON public.lfg_comment_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_lfg_comment_report();