-- 1) LFG posts contact/kakao_link: revoke column-level SELECT from clients.
--    Reads go through public.get_lfg_contact (SECURITY DEFINER) only.
REVOKE SELECT (contact, kakao_link) ON public.lfg_posts FROM anon, authenticated, PUBLIC;

-- INSERT/UPDATE on these columns by post owner must still work.
GRANT INSERT (contact, kakao_link), UPDATE (contact, kakao_link)
  ON public.lfg_posts TO authenticated;

-- 2) lfg_participants: prevent self-acceptance.
DROP POLICY IF EXISTS "lfgp update related" ON public.lfg_participants;

-- Applicants can update their own row only while it remains 'pending'
-- (e.g. edit their message), and cannot change status away from 'pending'.
CREATE POLICY "lfgp update self pending only"
  ON public.lfg_participants
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending'::lfg_participant_status)
  WITH CHECK (auth.uid() = user_id AND status = 'pending'::lfg_participant_status);

-- Post author can change status (accept/reject) of any participant on their post.
CREATE POLICY "lfgp update by post author"
  ON public.lfg_participants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lfg_posts p
      WHERE p.id = lfg_participants.post_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lfg_posts p
      WHERE p.id = lfg_participants.post_id AND p.user_id = auth.uid()
    )
  );