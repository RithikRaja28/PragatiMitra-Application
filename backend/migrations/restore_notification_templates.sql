-- ============================================================================
-- NOTIFICATION TEMPLATES RESTORATION SCRIPT
-- Generated from: backend/migrations/PRAGATI_FINAL_MERGE.sql
-- Date: 2026-06-24
-- Tables affected: notification_templates ONLY
--
-- Source: 23 rows extracted from COPY block in PRAGATI_FINAL_MERGE.sql
-- Cross-verified against seed logic in backend/server.js (lines 232-547)
--
-- Safety notes:
--   * updated_by set to NULL (FK references users; restored DB may have no users)
--   * ON CONFLICT (event_id) DO UPDATE SET — overwrites any partial server.js
--     auto-seeds that ran after cleanup, restoring exact admin-customised state
--   * Does NOT touch any other table
-- ============================================================================

BEGIN;


-- ============================================================
-- Category: Academic Year  (1 template(s))
-- ============================================================

-- Event: academic_year_activated  |  Label: Academic Year Activated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'ccf225ff-eeb9-41eb-80db-7afed52fa4e4',
  'academic_year_activated',
  E'Academic Year Activated',
  TRUE,
  TRUE,
  E'New Academic Year Activated — {ACADEMIC_YEAR}',
  E'Hi {FULL_NAME},\n\nAcademic Year {ACADEMIC_YEAR} has been activated for {INSTITUTION_NAME} on {APP_NAME}.\n\n{ACTIVE_FORMS_COUNT} form(s) are now available for submission. Please review your assigned forms and complete submissions before their deadlines.\n\nLog in to get started: {LOGIN_URL}\n\n— {APP_NAME} Team',
  E'Academic Year {ACADEMIC_YEAR} activated. {ACTIVE_FORMS_COUNT} form(s) available.',
  '2026-06-18 23:29:20.63993',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'Academic Year',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


-- ============================================================
-- Category: Administration  (10 template(s))
-- ============================================================

-- Event: department_created  |  Label: New Department Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'b21d8b49-0fef-42f6-86ad-03962b9272c6',
  'department_created',
  E'New Department Created',
  TRUE,
  TRUE,
  E'New Department Added — {DEPARTMENT_NAME}',
  E'Hi {FULL_NAME},\n\nA new department has been added to {INSTITUTION_NAME} on {APP_NAME}.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nYou can now assign users and forms to this department.\n\n— {APP_NAME} Team',
  E'Department "{DEPARTMENT_NAME}" has been added to {INSTITUTION_NAME}.',
  '2026-05-02 23:56:32.656362',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: committee_created  |  Label: Committee Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '2d92eafc-2a24-43c3-a61d-00a4431ab4da',
  'committee_created',
  E'Committee Created',
  TRUE,
  TRUE,
  E'Management Committee Added — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
  E'Hi {FULL_NAME},\n\nA new management committee record has been created on {APP_NAME}.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\nPosition: {POSITION}\nInstitution: {INSTITUTION_NAME}\n\nPlease review the committee details in the system.\n\n— {APP_NAME} Team',
  E'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been added.',
  '2026-06-17 22:15:37.483389',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: department_activated  |  Label: Department Activated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '999c94f6-52d9-4a31-b523-a95c776a00f5',
  'department_activated',
  E'Department Activated',
  TRUE,
  TRUE,
  E'Department Reactivated — {DEPARTMENT_NAME}',
  E'Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nUsers can now be assigned to this department.\n\n— {APP_NAME} Team',
  E'Department "{DEPARTMENT_NAME}" has been reactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: department_deactivated  |  Label: Department Deactivated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '8a2000a1-4135-4be5-86fd-2cbfb9b75214',
  'department_deactivated',
  E'Department Deactivated',
  TRUE,
  TRUE,
  E'Department Deactivated — {DEPARTMENT_NAME}',
  E'Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nNo new users can be assigned to this department while inactive.\n\n— {APP_NAME} Team',
  E'Department "{DEPARTMENT_NAME}" has been deactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: institution_created  |  Label: Institution Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'b96edc3d-c879-4ea0-ac55-bf9a7b01e0d1',
  'institution_created',
  E'Institution Created',
  TRUE,
  TRUE,
  E'New Institution Registered — {INSTITUTION_NAME}',
  E'Hi {FULL_NAME},\n\nA new institution has been successfully registered on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nEmail Domain: {EMAIL_DOMAIN}\nLocation: {CITY}, {STATE}\n\nYou can now onboard administrators and departments for this institution.\n\n— {APP_NAME} Team',
  E'Institution "{INSTITUTION_NAME}" has been registered.',
  '2026-06-17 22:15:37.483389',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'super_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: institution_activated  |  Label: Institution Activated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'f9ee51e4-83f0-49c6-a83f-8a978023c3af',
  'institution_activated',
  E'Institution Activated',
  TRUE,
  TRUE,
  E'Institution Reactivated — {INSTITUTION_NAME}',
  E'Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been reactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAll associated users and departments are now active.\n\n— {APP_NAME} Team',
  E'Institution "{INSTITUTION_NAME}" has been reactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'super_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: institution_deactivated  |  Label: Institution Deactivated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '718f3c39-333b-4ee0-adc7-84a6ef922c1b',
  'institution_deactivated',
  E'Institution Deactivated',
  TRUE,
  TRUE,
  E'Institution Deactivated — {INSTITUTION_NAME}',
  E'Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been deactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAccess for users of this institution has been restricted.\n\n— {APP_NAME} Team',
  E'Institution "{INSTITUTION_NAME}" has been deactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'super_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: committee_activated  |  Label: Committee Activated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'ada3ecd1-cb77-4e72-a0b1-430046ba3b72',
  'committee_activated',
  E'Committee Activated',
  TRUE,
  TRUE,
  E'Committee Reactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
  E'Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team',
  E'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been reactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: committee_deactivated  |  Label: Committee Deactivated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '9b7d07f6-0d87-4a6c-8841-e318a9a9da63',
  'committee_deactivated',
  E'Committee Deactivated',
  TRUE,
  TRUE,
  E'Committee Deactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})',
  E'Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team',
  E'Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been deactivated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: role_created  |  Label: Role Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'ea9863ec-a642-489c-a97b-1a9085ebc161',
  'role_created',
  E'Role Created',
  TRUE,
  TRUE,
  E'New Role Created — {ROLE_DISPLAY_NAME}',
  E'Hi {FULL_NAME},\n\nA new custom role has been created on {APP_NAME}.\n\nRole: {ROLE_DISPLAY_NAME}\nIdentifier: {ROLE_NAME}\nDescription: {ROLE_DESCRIPTION}\n\n— {APP_NAME} Team',
  E'New role "{ROLE_DISPLAY_NAME}" has been created.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'super_admin',
  'Administration',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


-- ============================================================
-- Category: Forms  (3 template(s))
-- ============================================================

-- Event: institute_form_created  |  Label: Institute Form Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '6989fbd0-e296-4d25-850e-bed3af3b7578',
  'institute_form_created',
  E'Institute Form Created',
  TRUE,
  TRUE,
  E'New Form Created — {FORM_NAME}',
  E'Hi {FULL_NAME},\n\nA new form has been created on {APP_NAME} for your institution.\n\nForm: {FORM_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nInstitution: {INSTITUTION_NAME}\nCreated By: {CREATED_BY}\nType: {FORM_TYPE}\nDeadline: {DEADLINE}\n\nPlease log in to review and manage this form.\n\n— {APP_NAME} Team',
  E'New form "{FORM_NAME}" has been created for {ACADEMIC_YEAR}.',
  '2026-06-18 23:29:20.673905',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'institute_admin',
  'Forms',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: department_form_created  |  Label: Department Form Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '9afedd45-98cf-4b08-b667-51078122673d',
  'department_form_created',
  E'Department Form Created',
  TRUE,
  TRUE,
  E'New Department Form — {FORM_NAME}',
  E'Hi {FULL_NAME},\n\nA new department form has been created on {APP_NAME}.\n\nForm: {FORM_NAME}\nDepartment: {DEPARTMENT_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nCreated By: {CREATED_BY}\nDeadline: {DEADLINE}\n\nPlease log in to review and complete this form before the deadline.\n\n— {APP_NAME} Team',
  E'New department form "{FORM_NAME}" created for {DEPARTMENT_NAME}.',
  '2026-06-18 23:29:20.673905',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'department_admin',
  'Forms',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: form_deadline_reminder  |  Label: Form Deadline Reminder
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'f34d77df-b457-437a-88cd-054cef03b27c',
  'form_deadline_reminder',
  E'Form Deadline Reminder',
  TRUE,
  TRUE,
  E'Deadline Reminder: {FORM_NAME} — {DAYS_REMAINING} day(s) left',
  E'Hi {FULL_NAME},\n\nThis is a reminder that the submission deadline for "{FORM_NAME}" is approaching on {APP_NAME}.\n\nForm: {FORM_NAME}\nDeadline: {DEADLINE}\nTime Remaining: {DAYS_REMAINING} day(s)\n\nPlease ensure all required submissions are completed before the deadline.\n\n— {APP_NAME} Team',
  E'Deadline reminder: "{FORM_NAME}" is due on {DEADLINE}.',
  '2026-06-18 23:29:20.703162',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'Forms',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


-- ============================================================
-- Category: Security  (3 template(s))
-- ============================================================

-- Event: account_suspended  |  Label: Account Suspended
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '939b1cc8-7f1b-4349-9e6a-ad3a5fd51cd5',
  'account_suspended',
  E'Account Suspended',
  TRUE,
  TRUE,
  E'Your {AppName} account has been suspended',
  E'Hi {UserName},\n \nYour account on {AppName} has been suspended by an administrator.\n \nIf you believe this is a mistake, please contact your institution admin.\n \n— {AppName} Team',
  E'Your {AppName} account has been suspended. Contact your admin for assistance.',
  '2026-05-02 14:58:03.528866',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'Security',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: password_reset  |  Label: Password Reset
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '9a0aba62-6483-4e27-aa55-b71be3b0d818',
  'password_reset',
  E'Password Reset',
  TRUE,
  TRUE,
  E'Reset Your Password — {APP_NAME}',
  E'Hi {FULL_NAME},\n\nWe received a request to reset your password for your {APP_NAME} account.\n\nClick the button below to reset your password. This link expires in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\n— {APP_NAME} Team',
  E'',
  '2026-05-02 14:58:03.528866',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'Security',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: account_reactivated  |  Label: Account Reactivated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '763d6d5f-65fa-4278-9ab6-c2f271784991',
  'account_reactivated',
  E'Account Reactivated',
  TRUE,
  TRUE,
  E'Your {AppName} account has been reactivated',
  E'Hi {UserName},\n \nGreat news — your account on {AppName} has been reactivated.\n \nYou can now log in at: {LoginURL}\n \n— {AppName} Team',
  E'Your {AppName} account has been reactivated. You can now log in.',
  '2026-05-02 14:58:03.528866',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'Security',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


-- ============================================================
-- Category: Team Management  (3 template(s))
-- ============================================================

-- Event: nodal_officer_assigned  |  Label: Nodal Officer Assigned
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '58631af8-6046-44df-b9d3-17e98c0f8542',
  'nodal_officer_assigned',
  E'Nodal Officer Assigned',
  TRUE,
  TRUE,
  E'You have been assigned as Nodal Officer on {AppName}',
  E'Hi {UserName},\n \nYou have been assigned as a Nodal Officer for "{DepartmentName}" on {AppName}.\n \nLog in here: {LoginURL}\n \n— {AppName} Team',
  E'You have been assigned as Nodal Officer for "{DepartmentName}".',
  '2026-05-02 23:19:01.19687',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'department_admin',
  'Team Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: nodal_officer_removed  |  Label: Nodal Officer Removed
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '01012079-13c1-4f91-9e24-57f7f2498d04',
  'nodal_officer_removed',
  E'Nodal Officer Removed',
  TRUE,
  TRUE,
  E'Nodal officer removed from {AppName}',
  E'Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been removed.\n\nIf you believe this is a mistake, please contact your institution administrator.\n\n— {APP_NAME} Team',
  E'Your Nodal Officer assignment for {REPORTING_YEAR} has been removed.',
  '2026-05-02 23:19:01.19687',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'department_admin',
  'Team Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: nodal_officer_activated  |  Label: Nodal Officer Activated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '32b0cdb5-803e-4a8e-b009-1c78854e3122',
  'nodal_officer_activated',
  E'Nodal Officer Activated',
  TRUE,
  TRUE,
  E'Your Nodal Officer Assignment Has Been Reinstated — {REPORTING_YEAR}',
  E'Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been reinstated.\n\nInstitution: {INSTITUTION_NAME}\nScope: {SCOPE}\n\nPlease log in to access your responsibilities.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team',
  E'Your Nodal Officer assignment for {REPORTING_YEAR} has been reinstated.',
  '2026-06-18 21:06:37.347717',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'department_admin',
  'Team Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


-- ============================================================
-- Category: User Management  (3 template(s))
-- ============================================================

-- Event: user_role_updated  |  Label: User Role Updated
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'c9dba787-a976-4e2e-aaf6-028777c21af5',
  'user_role_updated',
  E'User Role Updated',
  TRUE,
  TRUE,
  E'Your role on {AppName} has been updated',
  E'Hi {UserName},\n \nYour role on {AppName} has been updated to {NewRole}.\n \nIf you have any questions, please contact your administrator.\n \n— {AppName} Team',
  E'Your role on {AppName} has been updated to {NewRole}.',
  '2026-05-02 23:17:26.88429',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'super_admin',
  'User Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: import_completed  |  Label: Bulk Import Completed
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  '7d91cbda-d7be-441d-93d0-01de74c04112',
  'import_completed',
  E'Bulk Import Completed',
  TRUE,
  TRUE,
  E'Bulk User Import Completed — {APP_NAME}',
  E'Hi {FULL_NAME},\n\nYour bulk user import on {APP_NAME} has finished processing.\n\n  Imported : {IMPORTED}\n  Skipped  : {SKIPPED}\n  Failed   : {FAILED}\n  Total    : {TOTAL}\n\nPlease log in to review the imported users.\n\n— {APP_NAME} Team',
  E'Bulk import completed: {IMPORTED} imported, {SKIPPED} skipped, {FAILED} failed.',
  '2026-06-22 17:04:48.273556',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'User Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;

-- Event: user_created  |  Label: New User Created
INSERT INTO public.notification_templates
  (id, event_id, label, email_enabled, app_enabled,
   email_subject, email_body, app_message,
   updated_at, updated_by, role_group, category, is_active)
VALUES (
  'ee3c3044-b9de-4b5f-a06a-9cd788cf4c47',
  'user_created',
  E'New User Created',
  TRUE,
  TRUE,
  E'Welcome to {AppName} — Your Account is Ready',
  E'Hi {UserName},\n \nAn account has been created for you on {AppName}.\n \n  Email Address : {Email}\n  Temp Password : {TempPassword}\n \nFor security, you will be required to set a new password on your first login.\n \nLog in here: {LoginURL}\n \nIf you did not expect this email, please contact support.\n \n— {AppName} Team',
  E'Welcome {UserName}! Your account on {AppName} is ready. Tap to log in.',
  '2026-05-02 15:01:27.350228',
  NULL,                            -- updated_by: NULL (users table is empty post-reset)
  'system',
  'User Management',
  TRUE
)
ON CONFLICT (event_id) DO UPDATE SET
  label         = EXCLUDED.label,
  email_enabled = EXCLUDED.email_enabled,
  app_enabled   = EXCLUDED.app_enabled,
  email_subject = EXCLUDED.email_subject,
  email_body    = EXCLUDED.email_body,
  app_message   = EXCLUDED.app_message,
  updated_at    = EXCLUDED.updated_at,
  updated_by    = NULL,
  role_group    = EXCLUDED.role_group,
  category      = EXCLUDED.category,
  is_active     = EXCLUDED.is_active;


COMMIT;

-- ============================================================================
-- POST-RESTORE VERIFICATION
-- Run these queries to confirm restoration:
--
--   SELECT count(*) FROM notification_templates;                -- expect 23
--   SELECT event_id, label, category FROM notification_templates ORDER BY category, event_id;
--   SELECT event_id FROM notification_templates WHERE is_active = FALSE; -- expect 0 rows
-- ============================================================================
