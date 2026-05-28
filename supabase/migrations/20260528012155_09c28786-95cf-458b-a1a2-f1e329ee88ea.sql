-- Restrict client SELECT on subscriptions to exclude sensitive billing_key column
REVOKE SELECT ON public.subscriptions FROM authenticated, anon;
GRANT SELECT (id, user_id, plan, status, current_period_end, started_at, cancel_at_period_end, created_at, updated_at) ON public.subscriptions TO authenticated;
-- service_role retains full access for server-side operations
GRANT ALL ON public.subscriptions TO service_role;