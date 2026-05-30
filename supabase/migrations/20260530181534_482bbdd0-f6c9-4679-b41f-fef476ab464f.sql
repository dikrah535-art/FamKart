CREATE TABLE public.notebook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  greeting text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, entry_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_entries TO authenticated;
GRANT ALL ON public.notebook_entries TO service_role;

ALTER TABLE public.notebook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family notebook select" ON public.notebook_entries
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY "Family notebook insert" ON public.notebook_entries
  FOR INSERT WITH CHECK (family_id = current_family_id() AND user_id = auth.uid());
CREATE POLICY "Family notebook update" ON public.notebook_entries
  FOR UPDATE USING (family_id = current_family_id());
CREATE POLICY "Family notebook delete" ON public.notebook_entries
  FOR DELETE USING (family_id = current_family_id());

CREATE TRIGGER set_notebook_entries_updated_at
  BEFORE UPDATE ON public.notebook_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_notebook_entries_family_date ON public.notebook_entries (family_id, entry_date DESC);