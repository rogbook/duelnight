-- 1) events 테이블 확장: kind(대회/발매/매칭), 선행발매, 공식 URL
DO $$ BEGIN
  CREATE TYPE public.event_kind AS ENUM ('tournament', 'release', 'match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS kind public.event_kind NOT NULL DEFAULT 'tournament',
  ADD COLUMN IF NOT EXISTS early_release_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_url text;

CREATE INDEX IF NOT EXISTS events_kind_starts_at_idx
  ON public.events (kind, starts_at);

-- 2) profiles에 주 게임
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_game public.tcg_game;

-- 3) 즐겨찾기 (event 단위)
CREATE TABLE IF NOT EXISTS public.event_favorites (
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.event_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fav select own" ON public.event_favorites
  FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "fav insert own" ON public.event_favorites
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fav delete own" ON public.event_favorites
  FOR DELETE TO public USING (auth.uid() = user_id);

-- 4) 앱 내 알림
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif select own" ON public.notifications
  FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "notif update own" ON public.notifications
  FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "notif delete own" ON public.notifications
  FOR DELETE TO public USING (auth.uid() = user_id);

-- 5) 트리거: 새 이벤트가 등록되면 같은 game을 주 게임으로 설정한 사용자에게 알림
CREATE OR REPLACE FUNCTION public.notify_event_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind_label text;
BEGIN
  kind_label := CASE NEW.kind
    WHEN 'release' THEN '발매'
    WHEN 'match' THEN '매칭'
    ELSE '대회'
  END;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    p.id,
    'event_created',
    '새 ' || kind_label || ' 일정: ' || NEW.title,
    to_char(NEW.starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
    '/events/' || NEW.id::text
  FROM public.profiles p
  WHERE p.primary_game = NEW.game
    AND p.id <> NEW.user_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_notify_created ON public.events;
CREATE TRIGGER events_notify_created
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_created();

-- 6) 즐겨찾기한 이벤트 변경 시 본인에게 알림
CREATE OR REPLACE FUNCTION public.notify_event_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.location IS DISTINCT FROM OLD.location THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT
      f.user_id,
      'event_updated',
      '즐겨찾기 일정 변경: ' || NEW.title,
      to_char(NEW.starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      '/events/' || NEW.id::text
    FROM public.event_favorites f
    WHERE f.event_id = NEW.id AND f.user_id <> NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_notify_updated ON public.events;
CREATE TRIGGER events_notify_updated
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_updated();