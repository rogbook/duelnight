CREATE POLICY "cards admin insert" ON public.cards
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cards admin update" ON public.cards
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cards admin delete" ON public.cards
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));