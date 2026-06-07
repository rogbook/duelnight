CREATE POLICY "illust user update own pending"
ON public.card_illustrations
FOR UPDATE
TO authenticated
USING (submitted_by = auth.uid() AND status = 'pending'::card_status)
WITH CHECK (
  submitted_by = auth.uid()
  AND status = 'pending'::card_status
  AND is_primary = false
);