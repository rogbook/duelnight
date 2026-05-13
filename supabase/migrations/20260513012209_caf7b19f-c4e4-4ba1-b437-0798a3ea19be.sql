-- 1. Restrict store creation/edit/delete to admins (keep public read)
DROP POLICY IF EXISTS "stores insert own" ON public.stores;
DROP POLICY IF EXISTS "stores update own" ON public.stores;
DROP POLICY IF EXISTS "stores delete own" ON public.stores;

CREATE POLICY "stores insert admin" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stores update admin" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stores delete admin" ON public.stores
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Store favorites
CREATE TABLE IF NOT EXISTS public.store_favorites (
  user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

ALTER TABLE public.store_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_fav select own" ON public.store_favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "store_fav insert own" ON public.store_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "store_fav delete own" ON public.store_favorites
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_store_favorites_user ON public.store_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_store_favorites_store ON public.store_favorites(store_id);