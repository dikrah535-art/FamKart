REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_family_by_invite(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_family_id() FROM anon, PUBLIC;