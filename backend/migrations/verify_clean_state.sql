-- ============================================================
-- PragatiMitra — Post-Reset Verification Checklist
-- Run this after final_cleanup_reset.sql to confirm the
-- database is in a clean, deployment-ready state.
-- Every check should show the expected value in the comment.
-- ============================================================

-- 1. Preserved tables must have data
SELECT 'notification_templates' AS tbl, count(*) AS rows,
       CASE WHEN count(*) = 23 THEN 'PASS' ELSE 'FAIL (expected 23)' END AS status
FROM public.notification_templates
UNION ALL
SELECT 'roles', count(*),
       CASE WHEN count(*) = 12 THEN 'PASS' ELSE 'FAIL (expected 12)' END
FROM public.roles;

-- 2. Core application tables must be empty
SELECT tbl, rows,
       CASE WHEN rows = 0 THEN 'PASS' ELSE 'FAIL (must be 0)' END AS status
FROM (
    SELECT 'users'               AS tbl, count(*) AS rows FROM public.users
    UNION ALL SELECT 'user_roles',       count(*) FROM public.user_roles
    UNION ALL SELECT 'institutions',     count(*) FROM public.institutions
    UNION ALL SELECT 'departments',      count(*) FROM public.departments
    UNION ALL SELECT 'audit_logs',       count(*) FROM public.audit_logs
    UNION ALL SELECT 'email_queue',      count(*) FROM public.email_queue
    UNION ALL SELECT 'sessions',         count(*) FROM public.sessions
    UNION ALL SELECT 'notifications',    count(*) FROM public.notifications
    UNION ALL SELECT 'table_list',       count(*) FROM public.table_list
    UNION ALL SELECT 'custom_field_schemas', count(*) FROM public.custom_field_schemas
    UNION ALL SELECT 'form_assignments', count(*) FROM public.form_assignments
    UNION ALL SELECT 'reports',          count(*) FROM public.reports
    UNION ALL SELECT 'kpi_config',       count(*) FROM public.kpi_config
) t
ORDER BY status DESC, tbl;

-- 3. notification_templates.updated_by must all be NULL
SELECT CASE
    WHEN count(*) = 0 THEN 'PASS: all updated_by are NULL'
    ELSE 'FAIL: ' || count(*) || ' rows still have a non-NULL updated_by'
END AS fk_safety_check
FROM public.notification_templates
WHERE updated_by IS NOT NULL;

-- 4. FK constraint must be gone
SELECT CASE
    WHEN count(*) = 0 THEN 'PASS: notification_templates_updated_by_fkey is absent'
    ELSE 'FAIL: FK constraint still exists'
END AS fk_check
FROM pg_constraint
WHERE conrelid = 'public.notification_templates'::regclass
  AND conname   = 'notification_templates_updated_by_fkey';

-- 5. Roles sanity check — list all role names
SELECT name, display_name, is_system
FROM public.roles
ORDER BY name;

-- 6. Sequences reset — spot-check a few
SELECT sequence_name,
       pg_catalog.setval(sequence_name::regclass, 1, false) AS reset_to
FROM information_schema.sequences
WHERE sequence_schema = 'public'
  AND sequence_name NOT LIKE '%notification_templates%'
  AND sequence_name NOT LIKE '%roles%'
ORDER BY sequence_name
LIMIT 10;
