ALTER TABLE public.notebook_entries
  ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.notebook_entries
SET content = trim(both E'\n' FROM concat_ws(
  E'\n',
  nullif(greeting, ''),
  nullif((
    SELECT string_agg(
      concat_ws(
        ' ',
        item_index::text || '.',
        nullif(row_data ->> 'item', ''),
        CASE WHEN nullif(row_data ->> 'qty', '') IS NULL THEN NULL ELSE '- ' || (row_data ->> 'qty') END,
        nullif(row_data ->> 'unit', ''),
        CASE WHEN nullif(row_data ->> 'status', '') IS NULL THEN NULL ELSE '(' || replace(row_data ->> 'status', '_', ' ') || ')' END,
        CASE WHEN coalesce((row_data ->> 'bought')::boolean, false) THEN '[bought]' ELSE NULL END,
        CASE
          WHEN nullif(row_data ->> 'price', '') IS NOT NULL THEN 'Rs ' || (row_data ->> 'price')
          WHEN nullif(row_data ->> 'amount', '') IS NOT NULL THEN 'Rs ' || (row_data ->> 'amount')
          ELSE NULL
        END
      ),
      E'\n'
      ORDER BY item_index
    )
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS legacy_rows(row_data, item_index)
  ), '')
))
WHERE content = ''
  AND (nullif(greeting, '') IS NOT NULL OR jsonb_array_length(rows) > 0);

DO $$
BEGIN
  IF to_regclass('public.family_notebooks') IS NOT NULL THEN
    EXECUTE $migration$
      INSERT INTO public.notebook_entries (
        family_id,
        user_id,
        entry_date,
        content,
        updated_by,
        updated_at
      )
      SELECT
        family_notebooks.family_id,
        coalesce(family_notebooks.updated_by, families.created_by),
        CURRENT_DATE,
        family_notebooks.content,
        coalesce(family_notebooks.updated_by, families.created_by),
        coalesce(family_notebooks.updated_at, now())
      FROM public.family_notebooks
      JOIN public.families ON families.id = family_notebooks.family_id
      WHERE coalesce(family_notebooks.content, '') <> ''
      ON CONFLICT (family_id, entry_date)
      DO UPDATE SET
        content = CASE
          WHEN coalesce(public.notebook_entries.content, '') = '' THEN EXCLUDED.content
          ELSE public.notebook_entries.content
        END,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    $migration$;

    EXECUTE 'COMMENT ON TABLE public.family_notebooks IS ''Legacy notebook table migrated to notebook_entries by 20260701090000_unify_notebook_backend.sql. Kept for rollback/audit safety.''';
  END IF;
END $$;

DROP POLICY IF EXISTS "Family notebook update" ON public.notebook_entries;
DROP POLICY IF EXISTS "Family notebook delete" ON public.notebook_entries;

CREATE POLICY "Family notebook update" ON public.notebook_entries
  FOR UPDATE
  USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "Family notebook delete" ON public.notebook_entries
  FOR DELETE
  USING (family_id = public.current_family_id());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notebook_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.notebook_entries REPLICA IDENTITY FULL;
