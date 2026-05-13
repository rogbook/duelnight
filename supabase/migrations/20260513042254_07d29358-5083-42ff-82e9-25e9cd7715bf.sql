
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "card-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images');

CREATE POLICY "card-images authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-images');

CREATE POLICY "card-images owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'card-images' AND auth.uid() = owner)
WITH CHECK (bucket_id = 'card-images');

CREATE POLICY "card-images owner or admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'card-images'
  AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin'))
);
