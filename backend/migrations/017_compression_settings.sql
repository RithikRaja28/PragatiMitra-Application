-- Migration 017: Global compression settings
-- Creates a single-row configuration table for image and PDF upload size limits.
-- Seeded with defaults: images 40 KB–200 KB, PDFs 1 MB–2 MB.

CREATE TABLE IF NOT EXISTS public.compression_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_min_kb    INTEGER     NOT NULL DEFAULT 40,
  image_max_kb    INTEGER     NOT NULL DEFAULT 200,
  pdf_min_mb      NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  pdf_max_mb      NUMERIC(6,2) NOT NULL DEFAULT 2.0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID        REFERENCES public.users(id)
);

-- Ensure exactly one row exists (seed with defaults on first run)
INSERT INTO public.compression_settings (image_min_kb, image_max_kb, pdf_min_mb, pdf_max_mb)
SELECT 40, 200, 1.0, 2.0
WHERE NOT EXISTS (SELECT 1 FROM public.compression_settings);
