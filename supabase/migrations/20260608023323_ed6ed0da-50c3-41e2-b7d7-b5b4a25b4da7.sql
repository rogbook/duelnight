CREATE POLICY "card-images user upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'card-images'
  AND (storage.foldername(name))[1] = 'user-uploads'
  AND (storage.foldername(name))[2] = auth.uid()::text
);