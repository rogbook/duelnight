
CREATE OR REPLACE FUNCTION public.validate_collection_quantity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.quantity < 0 THEN RAISE EXCEPTION 'quantity must be >= 0'; END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
