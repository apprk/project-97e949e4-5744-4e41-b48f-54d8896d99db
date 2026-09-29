REVOKE EXECUTE ON FUNCTION public.my_workplace() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purchases_guard() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.my_workplace() TO authenticated;