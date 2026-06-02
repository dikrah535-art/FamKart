CREATE TABLE public.todo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  task_name text NOT NULL,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to uuid,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_entries TO authenticated;
GRANT ALL ON public.todo_entries TO service_role;

ALTER TABLE public.todo_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family todo select" ON public.todo_entries
  FOR SELECT USING (family_id = public.current_family_id());

CREATE POLICY "Family todo insert" ON public.todo_entries
  FOR INSERT WITH CHECK (family_id = public.current_family_id() AND created_by = auth.uid());

CREATE POLICY "Family todo update" ON public.todo_entries
  FOR UPDATE USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "Family todo delete" ON public.todo_entries
  FOR DELETE USING (family_id = public.current_family_id());

CREATE TRIGGER set_todo_entries_updated_at
BEFORE UPDATE ON public.todo_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_entries;
ALTER TABLE public.todo_entries REPLICA IDENTITY FULL;