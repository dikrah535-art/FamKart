-- Fix "new row violates row-level security policy for table families" on
-- create/join. The families SELECT policy only allows reading a family that is
-- already your current family, so insert/update-then-read from the client fails
-- the RLS check (chicken-and-egg). These SECURITY DEFINER RPCs perform the write
-- atomically while still binding the row to the calling user via auth.uid().

-- Create a family and attach the caller's profile to it.
create or replace function public.create_family(_name text)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _fam public.families;
begin
  if _uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if coalesce(btrim(_name), '') = '' then
    raise exception 'INVALID_NAME';
  end if;

  insert into public.families (name, created_by)
  values (btrim(_name), _uid)
  returning * into _fam;

  update public.profiles set family_id = _fam.id where id = _uid;

  return _fam;
end;
$$;

-- Join a family by invite code and attach the caller's profile to it.
create or replace function public.join_family(_code text)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _fam public.families;
begin
  if _uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into _fam
  from public.families
  where invite_code = upper(btrim(_code))
  limit 1;

  if _fam.id is null then
    raise exception 'INVALID_CODE';
  end if;

  update public.profiles set family_id = _fam.id where id = _uid;

  return _fam;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.join_family(text) to authenticated;
