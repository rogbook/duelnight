REVOKE EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_successful_payment(uuid, numeric, text, text, text) TO authenticated, service_role;