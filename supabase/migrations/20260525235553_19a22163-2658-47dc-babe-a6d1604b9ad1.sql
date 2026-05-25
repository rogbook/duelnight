
-- 1. user_drive_tokens: remove client-side SELECT access (server-only via service role)
DROP POLICY IF EXISTS "Users can view own drive tokens" ON public.user_drive_tokens;

-- 2. subscriptions: hide billing_key column from API clients
REVOKE SELECT (billing_key) ON public.subscriptions FROM anon, authenticated;

-- 3. lfg_posts: restrict reads to authenticated users
DROP POLICY IF EXISTS "lfg readable by all" ON public.lfg_posts;
CREATE POLICY "lfg readable by authenticated"
  ON public.lfg_posts
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. card-images bucket: only admins may upload (reads stay public)
DROP POLICY IF EXISTS "card-images authenticated upload" ON storage.objects;
CREATE POLICY "card-images admin upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'card-images'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 5. realtime.messages: require auth to subscribe to any channel
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can use realtime" ON realtime.messages;
CREATE POLICY "authenticated can use realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
