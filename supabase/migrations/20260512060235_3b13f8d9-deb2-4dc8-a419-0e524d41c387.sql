
CREATE TABLE public.user_collection (
  user_id uuid NOT NULL,
  card_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_code)
);

ALTER TABLE public.user_collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection select own" ON public.user_collection
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "collection insert own" ON public.user_collection
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collection update own" ON public.user_collection
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "collection delete own" ON public.user_collection
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_collection_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quantity < 0 THEN RAISE EXCEPTION 'quantity must be >= 0'; END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_user_collection_validate
BEFORE INSERT OR UPDATE ON public.user_collection
FOR EACH ROW EXECUTE FUNCTION public.validate_collection_quantity();

CREATE INDEX idx_user_collection_user ON public.user_collection(user_id);
