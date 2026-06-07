-- Revoke EXECUTE on process_successful_payment from authenticated/anon/public.
-- Server-side code uses service_role via supabaseAdmin; no client should call this RPC directly.
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text, text, integer, integer, text, text) TO service_role;

-- Defense-in-depth: also revoke EXECUTE on related credit/subscription mutation RPCs
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.activate_subscription(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, text, timestamptz) TO service_role;