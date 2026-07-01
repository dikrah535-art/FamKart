ALTER TABLE public.notebook_entries
  ADD COLUMN IF NOT EXISTS diary_notes text NOT NULL DEFAULT '';
