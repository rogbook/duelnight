
-- 1) Realtime: 본인이 sender/recipient인 토픽만 구독 가능하도록 제한
DROP POLICY IF EXISTS "authenticated can use realtime" ON realtime.messages;
CREATE POLICY "authenticated scoped realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE '%' || auth.uid()::text || '%');

-- 2) card_illustrations: 사용자 제출 시 is_primary=false 강제
DROP POLICY IF EXISTS "illust user insert pending" ON public.card_illustrations;
CREATE POLICY "illust user insert pending"
ON public.card_illustrations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND submitted_by = auth.uid()
  AND status = 'pending'::card_status
  AND is_primary = false
);

-- 3) user_drive_tokens: 본인 행만 SELECT 가능한 명시적 정책 추가
CREATE POLICY "Users can select own drive tokens"
ON public.user_drive_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
