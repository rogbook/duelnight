
CREATE TABLE public.user_drive_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  connected_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_drive_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drive tokens"
  ON public.user_drive_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own drive tokens"
  ON public.user_drive_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drive tokens"
  ON public.user_drive_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own drive tokens"
  ON public.user_drive_tokens FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_drive_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_user_drive_tokens_updated_at
  BEFORE UPDATE ON public.user_drive_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_drive_tokens_updated_at();
