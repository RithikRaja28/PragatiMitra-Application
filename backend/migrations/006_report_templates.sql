-- =============================================================================
-- 006_report_templates.sql
-- Adds report_templates, template_sections, template_blocks.
-- Wires template_id FK on reports.
-- Adds stamp_template_to_report() utility function.
-- =============================================================================

-- 1. REPORT TEMPLATES ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID        NOT NULL
                        REFERENCES public.institutions(institution_id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT,
  report_type         VARCHAR(100),
  version             VARCHAR(20) NOT NULL DEFAULT '1.0',
  default_workflow_id UUID        REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_institution
  ON public.report_templates (institution_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rpt_templates_upd') THEN
    CREATE TRIGGER trg_rpt_templates_upd BEFORE UPDATE ON public.report_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 2. TEMPLATE SECTIONS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_sections (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          UUID        NOT NULL
                         REFERENCES public.report_templates(id) ON DELETE CASCADE,
  parent_id            UUID        REFERENCES public.template_sections(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL,
  description          TEXT,
  order_index          REAL        NOT NULL DEFAULT 0,
  workflow_template_id UUID        REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  data_source_id       UUID        REFERENCES public.data_sources(id) ON DELETE SET NULL,
  created_by           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tmpl_sections_template
  ON public.template_sections (template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tmpl_sections_parent
  ON public.template_sections (parent_id) WHERE parent_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tmpl_sections_upd') THEN
    CREATE TRIGGER trg_tmpl_sections_upd BEFORE UPDATE ON public.template_sections
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 3. TEMPLATE BLOCKS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_blocks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_section_id UUID        NOT NULL
                        REFERENCES public.template_sections(id) ON DELETE CASCADE,
  block_type          VARCHAR(50) NOT NULL
                        CHECK (block_type IN (
                          'PARAGRAPH','HEADING','IMAGE','IMAGE_GRID',
                          'TABLE','KPI','CHART','LIST','CHECKLIST',
                          'FILE','DIVIDER','EMBED'
                        )),
  order_index         REAL        NOT NULL DEFAULT 0,
  default_content     JSONB       NOT NULL DEFAULT '{}',
  data_source_id      UUID        REFERENCES public.data_sources(id) ON DELETE SET NULL,
  is_required         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tmpl_blocks_section
  ON public.template_blocks (template_section_id, order_index);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tmpl_blocks_upd') THEN
    CREATE TRIGGER trg_tmpl_blocks_upd BEFORE UPDATE ON public.template_blocks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. Wire template_id FK on reports (deferred from 004) ------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reports_template_id_fkey'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES public.report_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_template
  ON public.reports (template_id) WHERE deleted_at IS NULL AND template_id IS NOT NULL;

-- 5. Wire source_template_section_id FK on report_sections ---------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_sections_source_template_section_id_fkey'
  ) THEN
    ALTER TABLE public.report_sections
      ADD CONSTRAINT report_sections_source_template_section_id_fkey
      FOREIGN KEY (source_template_section_id) REFERENCES public.template_sections(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sections_template_source
  ON public.report_sections (source_template_section_id)
  WHERE source_template_section_id IS NOT NULL;

-- 6. Wire source_template_block_id FK on section_blocks ------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'section_blocks_source_template_block_id_fkey'
  ) THEN
    ALTER TABLE public.section_blocks
      ADD CONSTRAINT section_blocks_source_template_block_id_fkey
      FOREIGN KEY (source_template_block_id) REFERENCES public.template_blocks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. STAMP TEMPLATE TO REPORT utility function ---------------------------------
CREATE OR REPLACE FUNCTION public.stamp_template_to_report(
  p_report_id   UUID,
  p_template_id UUID,
  p_created_by  UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_section_count  INTEGER := 0;
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
      SELECT ts2.*, o.depth + 1
      FROM public.template_sections ts2
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
      title, description, order_index,
      workflow_template_id, data_source_id,
      status, created_by
    ) VALUES (
      p_report_id, v_parent_id, ts.id,
      ts.title, ts.description, ts.order_index,
      ts.workflow_template_id, ts.data_source_id,
      'NOT_STARTED', p_created_by
    ) RETURNING id INTO v_new_section_id;

    v_id_map := v_id_map || jsonb_build_object(ts.id::text, v_new_section_id::text);
    v_section_count := v_section_count + 1;

    FOR tb IN
      SELECT * FROM public.template_blocks
      WHERE template_section_id = ts.id ORDER BY order_index
    LOOP
      INSERT INTO public.section_blocks (
        section_id, source_template_block_id,
        block_type, order_index, content,
        data_source_id, is_required, created_by
      ) VALUES (
        v_new_section_id, tb.id,
        tb.block_type, tb.order_index, tb.default_content,
        tb.data_source_id, tb.is_required, p_created_by
      );
    END LOOP;
  END LOOP;

  RETURN v_section_count;
END;
$$;

-- 8. Rebalance utilities -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebalance_section_order(p_report_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.report_sections AS s
  SET order_index = ranked.new_index, updated_at = NOW()
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY report_id, parent_id ORDER BY order_index) * 1000.0 AS new_index
    FROM public.report_sections WHERE report_id = p_report_id AND deleted_at IS NULL
  ) ranked WHERE s.id = ranked.id;
END; $$;

CREATE OR REPLACE FUNCTION public.rebalance_block_order(p_section_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.section_blocks AS b
  SET order_index = ranked.new_index, updated_at = NOW()
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) * 1000.0 AS new_index
    FROM public.section_blocks WHERE section_id = p_section_id AND deleted_at IS NULL
  ) ranked WHERE b.id = ranked.id;
END; $$;
