-- supabase/migrations/20260513150000_create_user_drive_tokens.sql

CREATE TABLE IF NOT EXISTS public.user_drive_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT,
    connected_email TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.user_drive_tokens ENABLE ROW LEVEL SECURITY;

-- 정책 설정: 본인 행만 접근 가능
CREATE POLICY "Users can manage own drive tokens" ON public.user_drive_tokens
    FOR ALL USING (auth.uid() = user_id);

-- updated_at 트리거 (이미 프로젝트에 handle_updated_at 함수가 있다고 가정)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_user_drive_tokens_updated_at') THEN
        CREATE TRIGGER set_user_drive_tokens_updated_at
        BEFORE UPDATE ON public.user_drive_tokens
        FOR EACH ROW
        EXECUTE FUNCTION moddatetime('updated_at');
    END IF;
EXCEPTION
    WHEN undefined_function THEN
        -- moddatetime이 없으면 수동으로 처리하거나 무시
        NULL;
END $$;
