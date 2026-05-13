-- Allow authenticated users to insert cards (community contribution)
-- Admins still control update/delete via existing policies
CREATE POLICY "cards user insert"
ON public.cards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);