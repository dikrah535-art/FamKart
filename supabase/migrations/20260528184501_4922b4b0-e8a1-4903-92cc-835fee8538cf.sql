-- Tighten families RLS: remove broad authenticated-read policy
DROP POLICY IF EXISTS "View family by invite (auth)" ON public.families;

-- Provide a SECURITY DEFINER RPC to look up a family by invite code (returns only id + name)
CREATE OR REPLACE FUNCTION public.find_family_by_invite(_code text)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.name
  FROM public.families f
  WHERE f.invite_code = upper(_code)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_family_by_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_family_by_invite(text) TO authenticated;