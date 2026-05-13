-- Enums
DO $$ BEGIN
  CREATE TYPE public.lfg_category AS ENUM ('friendly','tier','tournament_practice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lfg_participant_status AS ENUM ('pending','accepted','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend lfg_posts
ALTER TABLE public.lfg_posts
  ADD COLUMN IF NOT EXISTS store_id uuid,
  ADD COLUMN IF NOT EXISTS category public.lfg_category NOT NULL DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS games_count integer,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS quick_match boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kakao_link text;

-- Participants
CREATE TABLE IF NOT EXISTS public.lfg_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.lfg_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status public.lfg_participant_status NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.lfg_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfgp select related" ON public.lfg_participants
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.lfg_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );
CREATE POLICY "lfgp insert self" ON public.lfg_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (SELECT 1 FROM public.lfg_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );
CREATE POLICY "lfgp update related" ON public.lfg_participants
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.lfg_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );
CREATE POLICY "lfgp delete self" ON public.lfg_participants
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER lfgp_touch BEFORE UPDATE ON public.lfg_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Messages (per-post 1:1 thread between author and another user)
CREATE TABLE IF NOT EXISTS public.lfg_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.lfg_posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lfg_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfgm select party" ON public.lfg_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "lfgm insert sender" ON public.lfg_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.lfg_posts p WHERE p.id = post_id AND
      (p.user_id = auth.uid() OR p.user_id = recipient_id)
    )
  );
CREATE POLICY "lfgm update recipient" ON public.lfg_messages
  FOR UPDATE USING (auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS lfgm_thread_idx ON public.lfg_messages(post_id, created_at);
CREATE INDEX IF NOT EXISTS lfgp_post_idx ON public.lfg_participants(post_id);