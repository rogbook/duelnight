
-- 1) Restrict user_drive_tokens write policies to authenticated only
DROP POLICY IF EXISTS "Users can insert own drive tokens" ON public.user_drive_tokens;
DROP POLICY IF EXISTS "Users can update own drive tokens" ON public.user_drive_tokens;
DROP POLICY IF EXISTS "Users can delete own drive tokens" ON public.user_drive_tokens;

CREATE POLICY "Users can insert own drive tokens" ON public.user_drive_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drive tokens" ON public.user_drive_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own drive tokens" ON public.user_drive_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2) Hide lfg_posts.contact and kakao_link from direct SELECT.
--    Access is already gated via SECURITY DEFINER function public.get_lfg_contact()
--    which only returns these to the post owner or accepted participants.
REVOKE SELECT (contact, kakao_link) ON public.lfg_posts FROM anon, authenticated;
