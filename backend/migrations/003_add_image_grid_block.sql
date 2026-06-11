-- =============================================================================
-- 003_add_image_grid_block.sql
-- Adds IMAGE_GRID to the allowed block_type values.
-- Run once, after 001_report_builder.sql.
-- =============================================================================

-- Drop the auto-generated inline check constraint and recreate it with IMAGE_GRID.
ALTER TABLE public.section_blocks
  DROP CONSTRAINT IF EXISTS section_blocks_block_type_check;

ALTER TABLE public.section_blocks
  ADD CONSTRAINT section_blocks_block_type_check
  CHECK (block_type IN (
    'PARAGRAPH','HEADING','IMAGE','IMAGE_GRID',
    'TABLE','KPI','CHART','LIST','FILE','DIVIDER'
  ));
