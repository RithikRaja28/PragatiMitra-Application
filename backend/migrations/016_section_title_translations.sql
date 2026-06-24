-- Migration 016: JSONB title_translations on template_sections and report_sections
-- Replaces the section_translations table approach for section titles.
-- Each row carries its own translations: { "hi": "हिंदी शीर्षक", "ta": "தமிழ்", ... }

-- 1. template_sections — drop title_hi if previously added, add title_translations
ALTER TABLE public.template_sections
  DROP COLUMN IF EXISTS title_hi;

ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS title_translations JSONB NOT NULL DEFAULT '{}';

-- 2. report_sections — add title_translations
ALTER TABLE public.report_sections
  ADD COLUMN IF NOT EXISTS title_translations JSONB NOT NULL DEFAULT '{}';

-- 3. Update stamp_template_to_report to copy title_translations directly
CREATE OR REPLACE FUNCTION public.stamp_template_to_report(
  p_report_id   UUID,
  p_template_id UUID,
  p_created_by  UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count          INTEGER := 0;
  ts               RECORD;
  tb               RECORD;
  v_new_section_id UUID;
  v_id_map         JSONB := '{}';
  v_parent_id      UUID;
BEGIN
  FOR ts IN
    WITH RECURSIVE ordered AS (
      SELECT *, 0 AS depth FROM public.template_sections
      WHERE template_id = p_template_id AND parent_id IS NULL
      UNION ALL
      SELECT ts2.*, o.depth + 1 FROM public.template_sections ts2
      JOIN ordered o ON ts2.parent_id = o.id
      WHERE ts2.template_id = p_template_id
    )
    SELECT * FROM ordered ORDER BY depth, order_index
  LOOP
    v_parent_id := NULL;
    IF ts.parent_id IS NOT NULL THEN
      v_parent_id := (v_id_map ->> ts.parent_id::text)::uuid;
    END IF;

    INSERT INTO public.report_sections (
      report_id, parent_id, source_template_section_id,
      title, title_translations, description, order_index,
      workflow_template_id, status, created_by
    ) VALUES (
      p_report_id, v_parent_id, ts.id,
      ts.title, COALESCE(ts.title_translations, '{}'), ts.description, ts.order_index,
      ts.workflow_template_id, 'NOT_STARTED', p_created_by
    ) RETURNING id INTO v_new_section_id;

    v_id_map := v_id_map || jsonb_build_object(ts.id::text, v_new_section_id::text);
    v_count  := v_count + 1;

    FOR tb IN
      SELECT * FROM public.template_blocks
      WHERE template_section_id = ts.id ORDER BY order_index
    LOOP
      INSERT INTO public.section_blocks (
        section_id, source_template_block_id,
        block_type, order_index, content, is_required, created_by
      ) VALUES (
        v_new_section_id, tb.id,
        tb.block_type, tb.order_index, tb.default_content,
        tb.is_required, p_created_by
      );
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
