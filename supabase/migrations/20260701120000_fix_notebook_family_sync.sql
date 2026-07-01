-- Family Notebook sync hardening.
-- The notebook is family-owned: every member of the same family can read,
-- create, update, delete, and receive realtime changes for that family's pages.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_entries TO authenticated;

DROP POLICY IF EXISTS "Family notebook select" ON public.notebook_entries;
DROP POLICY IF EXISTS "Family notebook insert" ON public.notebook_entries;
DROP POLICY IF EXISTS "Family notebook update" ON public.notebook_entries;
DROP POLICY IF EXISTS "Family notebook delete" ON public.notebook_entries;

CREATE POLICY "Family notebook select" ON public.notebook_entries
  FOR SELECT
  TO authenticated
  USING (family_id = public.current_family_id());

CREATE POLICY "Family notebook insert" ON public.notebook_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "Family notebook update" ON public.notebook_entries
  FOR UPDATE
  TO authenticated
  USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "Family notebook delete" ON public.notebook_entries
  FOR DELETE
  TO authenticated
  USING (family_id = public.current_family_id());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notebook_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.notebook_entries REPLICA IDENTITY FULL;
