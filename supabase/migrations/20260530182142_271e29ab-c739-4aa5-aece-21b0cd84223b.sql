-- 1. Restrict notebook_entries UPDATE/DELETE to the entry's owner
DROP POLICY IF EXISTS "Family notebook update" ON public.notebook_entries;
DROP POLICY IF EXISTS "Family notebook delete" ON public.notebook_entries;

CREATE POLICY "Family notebook update" ON public.notebook_entries
  FOR UPDATE
  USING (family_id = current_family_id() AND user_id = auth.uid())
  WITH CHECK (family_id = current_family_id() AND user_id = auth.uid());

CREATE POLICY "Family notebook delete" ON public.notebook_entries
  FOR DELETE
  USING (family_id = current_family_id() AND user_id = auth.uid());

-- 2. Allow a family's creator to delete their own family
CREATE POLICY "Delete own family" ON public.families
  FOR DELETE
  USING (created_by = auth.uid());

-- 3. Realtime channel authorization — only family members can subscribe to
-- channels scoped to their family (topic format: "<prefix>:<family_id>")
DROP POLICY IF EXISTS "Family realtime topic read" ON realtime.messages;
CREATE POLICY "Family realtime topic read" ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    split_part(realtime.topic(), ':', 2) = public.current_family_id()::text
  );