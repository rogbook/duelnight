
-- 1) lfg_comments 테이블
CREATE TABLE public.lfg_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.lfg_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lfg_comments_post_idx ON public.lfg_comments(post_id, created_at);
CREATE INDEX lfg_comments_user_idx ON public.lfg_comments(user_id);

ALTER TABLE public.lfg_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfgc readable by all" ON public.lfg_comments
  FOR SELECT USING (true);

CREATE POLICY "lfgc insert auth" ON public.lfg_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lfgc update own" ON public.lfg_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "lfgc delete own or post author" ON public.lfg_comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.lfg_posts p WHERE p.id = lfg_comments.post_id AND p.user_id = auth.uid())
  );

CREATE TRIGGER lfg_comments_touch_updated_at
  BEFORE UPDATE ON public.lfg_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) 새 댓글 → 게시글 작성자(또는 부모 댓글 작성자)에게 알림
CREATE OR REPLACE FUNCTION public.notify_lfg_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_author uuid;
  post_title text;
  parent_author uuid;
  preview text;
BEGIN
  SELECT user_id, title INTO post_author, post_title FROM public.lfg_posts WHERE id = NEW.post_id;
  IF post_author IS NULL THEN RETURN NEW; END IF;

  preview := left(NEW.body, 80);

  -- 답글이면 부모 댓글 작성자에게도
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.lfg_comments WHERE id = NEW.parent_id;
    IF parent_author IS NOT NULL AND parent_author <> NEW.user_id AND parent_author <> post_author THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (parent_author, 'lfg_reply', '내 댓글에 답글: ' || post_title, preview, '/lfg/' || NEW.post_id::text);
    END IF;
  END IF;

  -- 게시글 작성자에게 (본인이 단 댓글이면 제외)
  IF post_author <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (post_author, 'lfg_comment', '새 댓글: ' || post_title, preview, '/lfg/' || NEW.post_id::text);
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER lfg_comments_notify
  AFTER INSERT ON public.lfg_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_lfg_comment();

-- 3) 새 LFG DM → 수신자 알림
CREATE OR REPLACE FUNCTION public.notify_lfg_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT COALESCE(p.display_name, p.username, '익명')
    INTO sender_name FROM public.profiles p WHERE p.id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.recipient_id,
    'lfg_dm',
    COALESCE(sender_name, '누군가') || '님의 새 메시지',
    left(NEW.body, 80),
    '/messages?post=' || NEW.post_id::text || '&with=' || NEW.sender_id::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER lfg_messages_notify
  AFTER INSERT ON public.lfg_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_lfg_message();

-- 4) 실시간 구독
ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_messages;
