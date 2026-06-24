--
-- PostgreSQL database dump
--

\restrict RXXZsfMMeACazKVAvdJ2wEAh89bjlSLaT0uWilpYi7hMruEUjXjR94iW9Gz87KM

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

-- Started on 2026-06-24 20:31:03

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 92826)
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- TOC entry 5945 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- TOC entry 3 (class 3079 OID 92907)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5946 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 984 (class 1247 OID 92945)
-- Name: committee_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.committee_type_enum AS ENUM (
    'GB',
    'EC',
    'SFC',
    'ASAC',
    'OTHERS'
);


ALTER TYPE public.committee_type_enum OWNER TO postgres;

--
-- TOC entry 987 (class 1247 OID 92956)
-- Name: department_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.department_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public.department_status OWNER TO postgres;

--
-- TOC entry 990 (class 1247 OID 92962)
-- Name: institution_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.institution_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED',
    'DELETED'
);


ALTER TYPE public.institution_status OWNER TO postgres;

--
-- TOC entry 993 (class 1247 OID 92972)
-- Name: position_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.position_enum AS ENUM (
    'CHAIRPERSON',
    'MEMBER_SECRETARY',
    'SECRETARY',
    'MEMBER',
    'VICE_PRESIDENT',
    'PRESIDENT'
);


ALTER TYPE public.position_enum OWNER TO postgres;

--
-- TOC entry 996 (class 1247 OID 92986)
-- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'DELETED'
);


ALTER TYPE public.user_status OWNER TO postgres;

--
-- TOC entry 297 (class 1255 OID 92995)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- TOC entry 311 (class 1255 OID 92996)
-- Name: trim_user_notifications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trim_user_notifications() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM notifications
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 3
  );
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.trim_user_notifications() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 219 (class 1259 OID 93005)
-- Name: academic_year_form_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_year_form_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    academic_year text NOT NULL,
    active_forms_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    archived_forms_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    open_close jsonb DEFAULT '{}'::jsonb NOT NULL,
    disabled jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.academic_year_form_config OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 93017)
-- Name: academic_year_master; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_year_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    academic_year text NOT NULL,
    start_year integer NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    archived_at timestamp with time zone,
    archived_by uuid
);


ALTER TABLE public.academic_year_master OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 93027)
-- Name: academic_year_notification_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_year_notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    academic_year text NOT NULL,
    recipient text NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.academic_year_notification_logs OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 93042)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    changed_fields text[],
    status text NOT NULL,
    message text,
    ip_address text,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    browser_name character varying(50),
    session_id uuid,
    CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['SUCCESS'::text, 'FAILURE'::text])))
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 93050)
-- Name: block_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.block_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    section_id uuid NOT NULL,
    parent_id uuid,
    body text NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.block_comments OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 93059)
-- Name: block_translations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.block_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    language character varying(10) NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_translations_status_check CHECK (((status)::text = ANY (ARRAY[('DRAFT'::character varying)::text, ('IN_PROGRESS'::character varying)::text, ('REVIEW'::character varying)::text, ('APPROVED'::character varying)::text])))
);


ALTER TABLE public.block_translations OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 93070)
-- Name: branding_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branding_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    asset_type character varying(20) NOT NULL,
    user_id uuid,
    asset_url text,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT branding_assignments_asset_type_check CHECK (((asset_type)::text = ANY (ARRAY[('COVER_IMAGE'::character varying)::text, ('LOGO'::character varying)::text, ('BG_IMAGE'::character varying)::text])))
);


ALTER TABLE public.branding_assignments OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 93078)
-- Name: builder_approvals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.builder_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    decision character varying(30) NOT NULL,
    comments text,
    version_num integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT builder_approvals_decision_check CHECK (((decision)::text = ANY (ARRAY[('APPROVED'::character varying)::text, ('REJECTED'::character varying)::text, ('REVISION_REQUIRED'::character varying)::text])))
);


ALTER TABLE public.builder_approvals OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 93086)
-- Name: builder_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.builder_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid,
    section_id uuid,
    block_id uuid,
    file_name text NOT NULL,
    file_size bigint,
    mime_type character varying(200),
    storage_path text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum character varying(64)
);


ALTER TABLE public.builder_attachments OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 93117)
-- Name: compiled_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compiled_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    language character varying(10) DEFAULT 'en'::character varying NOT NULL,
    format character varying(20) DEFAULT 'PDF'::character varying NOT NULL,
    storage_path text NOT NULL,
    file_size bigint,
    checksum character varying(64),
    compile_options jsonb DEFAULT '{}'::jsonb NOT NULL,
    included_sections uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    compiled_at timestamp with time zone DEFAULT now() NOT NULL,
    compiled_by uuid,
    CONSTRAINT compiled_reports_format_check CHECK (((format)::text = ANY (ARRAY[('PDF'::character varying)::text, ('DOCX'::character varying)::text, ('HTML'::character varying)::text, ('JSON'::character varying)::text])))
);


ALTER TABLE public.compiled_reports OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 93137)
-- Name: custom_field_schemas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_field_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institution_id uuid NOT NULL,
    year integer NOT NULL,
    schema jsonb NOT NULL,
    is_active boolean DEFAULT true,
    used_column_names text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    source_form_id uuid,
    source_institution_id uuid,
    published_at timestamp with time zone,
    schema_snapshot_version integer
);


ALTER TABLE public.custom_field_schemas OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 93146)
-- Name: cycle_department_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cycle_department_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    department_id uuid NOT NULL,
    submission_deadline timestamp with time zone,
    review_deadline timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cycle_department_deadlines OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 93152)
-- Name: dashboard_kpi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboard_kpi (
    id integer NOT NULL,
    kpi_config_id integer NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.dashboard_kpi OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 93159)
-- Name: dashboard_kpi_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dashboard_kpi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dashboard_kpi_id_seq OWNER TO postgres;

--
-- TOC entry 5947 (class 0 OID 0)
-- Dependencies: 232
-- Name: dashboard_kpi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dashboard_kpi_id_seq OWNED BY public.dashboard_kpi.id;


--
-- TOC entry 233 (class 1259 OID 93160)
-- Name: data_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    source_type character varying(30) DEFAULT 'SQL'::character varying NOT NULL,
    query text,
    connection_id character varying(255),
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    column_map jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_sources_source_type_check CHECK (((source_type)::text = ANY (ARRAY[('SQL'::character varying)::text, ('API'::character varying)::text, ('UPLOAD'::character varying)::text])))
);


ALTER TABLE public.data_sources OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 93180)
-- Name: department_form_deadline_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_form_deadline_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_form_id uuid NOT NULL,
    institution_id uuid,
    department_id uuid,
    academic_year integer NOT NULL,
    deadline_at timestamp with time zone,
    is_locked boolean DEFAULT false NOT NULL,
    auto_locked boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.department_form_deadline_config OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 93188)
-- Name: department_form_lock_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_form_lock_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_form_id uuid NOT NULL,
    department_id uuid NOT NULL,
    deadline timestamp with time zone,
    is_locked boolean DEFAULT false NOT NULL,
    auto_locked boolean DEFAULT false NOT NULL,
    locked_by uuid,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.department_form_lock_config OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 93196)
-- Name: department_form_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_form_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_form_id uuid NOT NULL,
    role_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    institution_id uuid,
    department_id uuid,
    academic_year integer,
    role_id uuid
);


ALTER TABLE public.department_form_roles OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 93203)
-- Name: department_form_year_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_form_year_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_form_id uuid NOT NULL,
    academic_year integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.department_form_year_mapping OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 93214)
-- Name: department_table_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_table_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    form_description text,
    department_id uuid NOT NULL,
    institution_id uuid,
    academic_year integer NOT NULL,
    visibility text DEFAULT 'department'::text,
    translate_enabled boolean DEFAULT true NOT NULL,
    deadline_enabled boolean DEFAULT false NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    schema jsonb,
    used_column_names text[],
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.department_table_list OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 93227)
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    department_id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    status public.department_status DEFAULT 'ACTIVE'::public.department_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    name_hi text
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 93252)
-- Name: email_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying(50) NOT NULL,
    recipient_email text NOT NULL,
    recipient_user_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    last_attempted_at timestamp with time zone,
    last_error text,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_queue_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('sent'::character varying)::text, ('failed'::character varying)::text])))
);


ALTER TABLE public.email_queue OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 93281)
-- Name: form_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    form_name text,
    institution_id uuid,
    department_id uuid,
    academic_year integer NOT NULL,
    assigned_by uuid,
    assigned_to uuid NOT NULL,
    role text DEFAULT 'contributor'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.form_assignments OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 93292)
-- Name: form_deadline_reminder_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_deadline_reminder_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_key text NOT NULL,
    reminder_type text NOT NULL,
    recipient_email text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.form_deadline_reminder_log OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 93299)
-- Name: form_lock_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_lock_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institution_id uuid NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    locked_by uuid,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deadline_at timestamp with time zone,
    auto_locked boolean DEFAULT false
);


ALTER TABLE public.form_lock_config OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 93309)
-- Name: form_year_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_year_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institution_id uuid NOT NULL,
    academic_year integer NOT NULL,
    deadline_at timestamp with time zone,
    is_locked boolean DEFAULT false NOT NULL,
    auto_locked boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.form_year_deadlines OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 93350)
-- Name: institutions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.institutions (
    institution_id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_name text NOT NULL,
    code text NOT NULL,
    email_domain text NOT NULL,
    address_line1 text NOT NULL,
    address_line2 text,
    city text NOT NULL,
    state text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    pincode text NOT NULL,
    status public.institution_status DEFAULT 'ACTIVE'::public.institution_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.institutions OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 93360)
-- Name: kpi_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_config (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    table_name character varying(255) NOT NULL,
    x_col character varying(255) NOT NULL,
    y_cols text[] NOT NULL,
    chart_type character varying(50) DEFAULT 'bar'::character varying,
    row_limit text DEFAULT 500,
    query text,
    created_by text,
    updated_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    scope character varying(20) DEFAULT 'institute'::character varying NOT NULL,
    institute_id text,
    department_id text,
    card_category character varying(100),
    show_on_dashboard boolean DEFAULT false NOT NULL,
    dashboard_display_type text DEFAULT 'single'::text NOT NULL,
    dashboard_group_name text,
    academic_year character varying(20),
    aggregation_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    group_by_column character varying(255),
    export_title text,
    title_hi text,
    description_hi text,
    export_title_hi text
);


ALTER TABLE public.kpi_config OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 93373)
-- Name: kpi_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.kpi_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.kpi_config_id_seq OWNER TO postgres;

--
-- TOC entry 5948 (class 0 OID 0)
-- Dependencies: 247
-- Name: kpi_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.kpi_config_id_seq OWNED BY public.kpi_config.id;


--
-- TOC entry 248 (class 1259 OID 93382)
-- Name: kpi_svg_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_svg_reports (
    id integer NOT NULL,
    config_id integer,
    title text,
    svg_data text NOT NULL,
    report_data jsonb,
    created_at timestamp without time zone DEFAULT now(),
    svg_bytes integer GENERATED ALWAYS AS (length(svg_data)) STORED,
    exported_at timestamp without time zone DEFAULT now() NOT NULL,
    academic_year integer
);


ALTER TABLE public.kpi_svg_reports OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 93390)
-- Name: kpi_svg_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.kpi_svg_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.kpi_svg_reports_id_seq OWNER TO postgres;

--
-- TOC entry 5949 (class 0 OID 0)
-- Dependencies: 249
-- Name: kpi_svg_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.kpi_svg_reports_id_seq OWNED BY public.kpi_svg_reports.id;


--
-- TOC entry 250 (class 1259 OID 93391)
-- Name: management_committees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.management_committees (
    id bigint NOT NULL,
    institute_id uuid NOT NULL,
    finance_year character varying(9) NOT NULL,
    committee_type public.committee_type_enum NOT NULL,
    members jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" public.position_enum NOT NULL,
    contact text,
    status character varying(10) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT management_committees_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('INACTIVE'::character varying)::text])))
);


ALTER TABLE public.management_committees OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 93401)
-- Name: management_committees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.management_committees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.management_committees_id_seq OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 93402)
-- Name: management_committees_id_seq1; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.management_committees_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.management_committees_id_seq1 OWNER TO postgres;

--
-- TOC entry 5950 (class 0 OID 0)
-- Dependencies: 252
-- Name: management_committees_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.management_committees_id_seq1 OWNED BY public.management_committees.id;


--
-- TOC entry 253 (class 1259 OID 93403)
-- Name: new_share_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.new_share_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    department_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    source_row_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reg_no text
);


ALTER TABLE public.new_share_records OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 93411)
-- Name: nodal_officer_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nodal_officer_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    department_id uuid,
    user_id uuid NOT NULL,
    reporting_year text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.nodal_officer_assignments OWNER TO postgres;

--
-- TOC entry 255 (class 1259 OID 93420)
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    app_enabled boolean DEFAULT true NOT NULL,
    email_subject text NOT NULL,
    email_body text NOT NULL,
    app_message text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    role_group character varying(50) DEFAULT 'system'::character varying NOT NULL,
    category character varying(100) DEFAULT 'General'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.notification_templates OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 93433)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    event_id character varying(64),
    title text NOT NULL,
    message text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(50),
    body text,
    entity_type character varying(50),
    entity_id uuid,
    read_at timestamp with time zone
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 257 (class 1259 OID 93440)
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- TOC entry 5951 (class 0 OID 0)
-- Dependencies: 257
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- TOC entry 258 (class 1259 OID 93441)
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- TOC entry 259 (class 1259 OID 93464)
-- Name: report_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    role_name character varying(100) NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


ALTER TABLE public.report_access OWNER TO postgres;

--
-- TOC entry 260 (class 1259 OID 93469)
-- Name: report_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid,
    entity_type character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    user_id uuid,
    ip_address inet,
    user_agent text,
    session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.report_audit_log OWNER TO postgres;

--
-- TOC entry 261 (class 1259 OID 93476)
-- Name: report_department_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_department_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    department_id uuid NOT NULL,
    submission_deadline timestamp with time zone,
    review_deadline timestamp with time zone,
    approval_deadline timestamp with time zone,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_rpt_dept_deadline_order CHECK ((((submission_deadline IS NULL) OR (review_deadline IS NULL) OR (submission_deadline <= review_deadline)) AND ((review_deadline IS NULL) OR (approval_deadline IS NULL) OR (review_deadline <= approval_deadline))))
);


ALTER TABLE public.report_department_deadlines OWNER TO postgres;

--
-- TOC entry 262 (class 1259 OID 93485)
-- Name: report_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    order_index integer DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'NOT_STARTED'::character varying NOT NULL,
    version_lock integer DEFAULT 0 NOT NULL,
    locked_by uuid,
    locked_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    source_template_section_id uuid,
    workflow_template_id uuid,
    current_step_id uuid,
    submission_deadline timestamp with time zone,
    review_deadline timestamp with time zone,
    data_source_id uuid,
    approval_deadline timestamp with time zone,
    CONSTRAINT report_sections_status_check CHECK (((status)::text = ANY (ARRAY[('NOT_STARTED'::character varying)::text, ('IN_PROGRESS'::character varying)::text, ('SUBMITTED'::character varying)::text, ('UNDER_REVIEW'::character varying)::text, ('APPROVED'::character varying)::text, ('SENT_BACK'::character varying)::text, ('LOCKED'::character varying)::text])))
);


ALTER TABLE public.report_sections OWNER TO postgres;

--
-- TOC entry 263 (class 1259 OID 93497)
-- Name: report_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    report_type character varying(100),
    version character varying(20) DEFAULT '1.0'::character varying NOT NULL,
    default_workflow_id uuid,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_templates_status_check CHECK (((status)::text = ANY (ARRAY[('DRAFT'::character varying)::text, ('ACTIVE'::character varying)::text, ('ARCHIVED'::character varying)::text])))
);


ALTER TABLE public.report_templates OWNER TO postgres;

--
-- TOC entry 264 (class 1259 OID 93516)
-- Name: reporting_cycles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reporting_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reporting_year character varying(20),
    submission_deadline timestamp with time zone,
    review_deadline timestamp with time zone,
    approval_deadline timestamp with time zone,
    status character varying(30) DEFAULT 'ACTIVE'::character varying NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    archived_at timestamp with time zone,
    archived_by uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_cycle_dates CHECK ((end_date >= start_date)),
    CONSTRAINT chk_cycle_deadlines_within_bounds CHECK ((((submission_deadline IS NULL) OR (((submission_deadline)::date >= start_date) AND ((submission_deadline)::date <= end_date))) AND ((review_deadline IS NULL) OR (((review_deadline)::date >= start_date) AND ((review_deadline)::date <= end_date))) AND ((approval_deadline IS NULL) OR (((approval_deadline)::date >= start_date) AND ((approval_deadline)::date <= end_date))))),
    CONSTRAINT chk_deadline_order CHECK ((((submission_deadline IS NULL) OR (review_deadline IS NULL) OR (submission_deadline <= review_deadline)) AND ((review_deadline IS NULL) OR (approval_deadline IS NULL) OR (review_deadline <= approval_deadline)))),
    CONSTRAINT reporting_cycles_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('CLOSED'::character varying)::text, ('ARCHIVED'::character varying)::text])))
);


ALTER TABLE public.reporting_cycles OWNER TO postgres;

--
-- TOC entry 265 (class 1259 OID 93529)
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    title text NOT NULL,
    report_type character varying(100),
    academic_year character varying(20),
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cover_image_url text,
    logo_url text,
    bg_image_url text,
    cycle_id uuid,
    template_id uuid,
    is_locked boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    primary_language character varying(10) DEFAULT 'en'::character varying NOT NULL,
    description text,
    submission_deadline timestamp with time zone,
    review_deadline timestamp with time zone,
    approval_deadline timestamp with time zone,
    default_workflow_id uuid,
    CONSTRAINT reports_status_check CHECK (((status)::text = ANY (ARRAY[('DRAFT'::character varying)::text, ('PUBLISHED'::character varying)::text, ('ARCHIVED'::character varying)::text])))
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 93541)
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_system boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- TOC entry 267 (class 1259 OID 93551)
-- Name: schema_propagation_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_propagation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institution_id uuid NOT NULL,
    academic_year integer,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_propagation_log OWNER TO postgres;

--
-- TOC entry 268 (class 1259 OID 93558)
-- Name: section_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    user_id uuid,
    role_name character varying(100),
    permission character varying(20) DEFAULT 'READ'::character varying NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    department_id uuid,
    CONSTRAINT chk_section_access_target CHECK ((((((user_id IS NOT NULL))::integer + ((role_name IS NOT NULL))::integer) + ((department_id IS NOT NULL))::integer) >= 1)),
    CONSTRAINT section_access_permission_check CHECK (((permission)::text = ANY (ARRAY[('READ'::character varying)::text, ('WRITE'::character varying)::text, ('REVIEW'::character varying)::text, ('ADMIN'::character varying)::text])))
);


ALTER TABLE public.section_access OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 93566)
-- Name: section_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) DEFAULT 'CONTRIBUTOR'::character varying NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    due_at timestamp with time zone,
    notified_at timestamp with time zone,
    CONSTRAINT section_assignments_role_check CHECK (((role)::text = ANY (ARRAY[('OWNER'::character varying)::text, ('CONTRIBUTOR'::character varying)::text, ('REVIEWER'::character varying)::text])))
);


ALTER TABLE public.section_assignments OWNER TO postgres;

--
-- TOC entry 270 (class 1259 OID 93573)
-- Name: section_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    block_type character varying(50) NOT NULL,
    order_index real DEFAULT 0 NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    source_template_block_id uuid,
    data_source_id uuid,
    is_required boolean DEFAULT false NOT NULL,
    CONSTRAINT section_blocks_block_type_check CHECK (((block_type)::text = ANY (ARRAY[('PARAGRAPH'::character varying)::text, ('HEADING'::character varying)::text, ('IMAGE'::character varying)::text, ('IMAGE_GRID'::character varying)::text, ('TABLE'::character varying)::text, ('KPI'::character varying)::text, ('CHART'::character varying)::text, ('LIST'::character varying)::text, ('CHECKLIST'::character varying)::text, ('FILE'::character varying)::text, ('DIVIDER'::character varying)::text, ('EMBED'::character varying)::text])))
);


ALTER TABLE public.section_blocks OWNER TO postgres;

--
-- TOC entry 271 (class 1259 OID 93585)
-- Name: section_department_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_department_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    department_id uuid NOT NULL,
    assigned_by uuid,
    due_at timestamp with time zone,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.section_department_assignments OWNER TO postgres;

--
-- TOC entry 272 (class 1259 OID 93590)
-- Name: section_signoffs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_signoffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    workflow_step_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    decision character varying(20) NOT NULL,
    version_num integer NOT NULL,
    comment text,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT section_signoffs_decision_check CHECK (((decision)::text = ANY (ARRAY[('APPROVED'::character varying)::text, ('SENT_BACK'::character varying)::text])))
);


ALTER TABLE public.section_signoffs OWNER TO postgres;

--
-- TOC entry 273 (class 1259 OID 93598)
-- Name: section_translations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    language character varying(10) NOT NULL,
    title text NOT NULL,
    description text,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT section_translations_status_check CHECK (((status)::text = ANY (ARRAY[('DRAFT'::character varying)::text, ('IN_PROGRESS'::character varying)::text, ('REVIEW'::character varying)::text, ('APPROVED'::character varying)::text])))
);


ALTER TABLE public.section_translations OWNER TO postgres;

--
-- TOC entry 274 (class 1259 OID 93608)
-- Name: section_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    version_num integer NOT NULL,
    event character varying(50) NOT NULL,
    snapshot jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workflow_step_id uuid,
    reviewer_id uuid,
    decision character varying(20),
    reviewer_comment text,
    latest_decision character varying(20),
    latest_decision_by uuid,
    latest_decision_at timestamp with time zone,
    latest_decision_step_id uuid,
    description text,
    CONSTRAINT section_versions_decision_check CHECK ((((decision)::text = ANY (ARRAY[('APPROVED'::character varying)::text, ('SENT_BACK'::character varying)::text])) OR (decision IS NULL))),
    CONSTRAINT section_versions_event_check CHECK (((event)::text = ANY (ARRAY[('SUBMITTED'::character varying)::text, ('RESTORED'::character varying)::text, ('MANUAL'::character varying)::text, ('AUTO_SAVE'::character varying)::text]))),
    CONSTRAINT section_versions_latest_decision_check CHECK ((((latest_decision)::text = ANY (ARRAY[('APPROVED'::character varying)::text, ('SENT_BACK'::character varying)::text])) OR (latest_decision IS NULL)))
);


ALTER TABLE public.section_versions OWNER TO postgres;

--
-- TOC entry 275 (class 1259 OID 93618)
-- Name: section_workflow_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.section_workflow_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    section_id uuid NOT NULL,
    workflow_step_id uuid,
    assignee_type character varying(20) NOT NULL,
    user_id uuid,
    department_id uuid,
    role_name character varying(100),
    due_at timestamp with time zone,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    notified_at timestamp with time zone,
    CONSTRAINT chk_assignee_identity CHECK (((((assignee_type)::text = 'USER'::text) AND (user_id IS NOT NULL) AND (department_id IS NULL) AND (role_name IS NULL)) OR (((assignee_type)::text = 'DEPARTMENT'::text) AND (department_id IS NOT NULL) AND (user_id IS NULL) AND (role_name IS NULL)) OR (((assignee_type)::text = 'ROLE'::text) AND (role_name IS NOT NULL) AND (user_id IS NULL) AND (department_id IS NULL)))),
    CONSTRAINT section_workflow_assignments_assignee_type_check CHECK (((assignee_type)::text = ANY (ARRAY[('USER'::character varying)::text, ('DEPARTMENT'::character varying)::text, ('ROLE'::character varying)::text])))
);


ALTER TABLE public.section_workflow_assignments OWNER TO postgres;

--
-- TOC entry 276 (class 1259 OID 93633)
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    previous_token_hash text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- TOC entry 277 (class 1259 OID 93649)
-- Name: shared_form_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shared_form_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_form_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    form_name text NOT NULL,
    schema jsonb NOT NULL,
    used_column_names text[],
    created_by uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shared_form_snapshots OWNER TO postgres;

--
-- TOC entry 278 (class 1259 OID 93665)
-- Name: table_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.table_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institute_access uuid[],
    share_table boolean,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    translate_to_hindi boolean DEFAULT true NOT NULL,
    form_domain text DEFAULT 'academic'::text NOT NULL
);


ALTER TABLE public.table_list OWNER TO postgres;

--
-- TOC entry 279 (class 1259 OID 93675)
-- Name: template_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_section_id uuid NOT NULL,
    block_type character varying(50) NOT NULL,
    order_index real DEFAULT 0 NOT NULL,
    default_content jsonb DEFAULT '{}'::jsonb NOT NULL,
    data_source_id uuid,
    is_required boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT template_blocks_block_type_check CHECK (((block_type)::text = ANY (ARRAY[('PARAGRAPH'::character varying)::text, ('HEADING'::character varying)::text, ('IMAGE'::character varying)::text, ('IMAGE_GRID'::character varying)::text, ('TABLE'::character varying)::text, ('KPI'::character varying)::text, ('CHART'::character varying)::text, ('LIST'::character varying)::text, ('CHECKLIST'::character varying)::text, ('FILE'::character varying)::text, ('DIVIDER'::character varying)::text, ('EMBED'::character varying)::text])))
);


ALTER TABLE public.template_blocks OWNER TO postgres;

--
-- TOC entry 280 (class 1259 OID 93687)
-- Name: template_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    order_index real DEFAULT 0 NOT NULL,
    workflow_template_id uuid,
    data_source_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template_sections OWNER TO postgres;

--
-- TOC entry 281 (class 1259 OID 93704)
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- TOC entry 282 (class 1259 OID 93709)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid,
    department_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    profile_image_url text,
    must_change_password boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    account_status public.user_status DEFAULT 'ACTIVE'::public.user_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 1 NOT NULL,
    is_temporary_password boolean DEFAULT false,
    role_domain text DEFAULT 'academic'::text NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 283 (class 1259 OID 93721)
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    step_order integer NOT NULL,
    step_name text NOT NULL,
    approver_role character varying(100),
    approver_user_id uuid,
    approver_department_id uuid,
    CONSTRAINT chk_step_approver CHECK (((((approver_role IS NOT NULL))::integer + ((approver_user_id IS NOT NULL))::integer) >= 1))
);


ALTER TABLE public.workflow_steps OWNER TO postgres;

--
-- TOC entry 284 (class 1259 OID 93728)
-- Name: workflow_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workflow_templates OWNER TO postgres;

--
-- TOC entry 5129 (class 2604 OID 93737)
-- Name: dashboard_kpi id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_kpi ALTER COLUMN id SET DEFAULT nextval('public.dashboard_kpi_id_seq'::regclass);


--
-- TOC entry 5198 (class 2604 OID 93738)
-- Name: kpi_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_config ALTER COLUMN id SET DEFAULT nextval('public.kpi_config_id_seq'::regclass);


--
-- TOC entry 5207 (class 2604 OID 93739)
-- Name: kpi_svg_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_svg_reports ALTER COLUMN id SET DEFAULT nextval('public.kpi_svg_reports_id_seq'::regclass);


--
-- TOC entry 5211 (class 2604 OID 93740)
-- Name: management_committees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.management_committees ALTER COLUMN id SET DEFAULT nextval('public.management_committees_id_seq1'::regclass);


--
-- TOC entry 5231 (class 2604 OID 93741)
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- TOC entry 5874 (class 0 OID 93005)
-- Dependencies: 219
-- Data for Name: academic_year_form_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.academic_year_form_config (id, institution_id, academic_year, active_forms_json, archived_forms_json, open_close, disabled, created_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5875 (class 0 OID 93017)
-- Dependencies: 220
-- Data for Name: academic_year_master; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.academic_year_master (id, institution_id, academic_year, start_year, active, created_by, created_at, is_locked, is_archived, locked_at, locked_by, archived_at, archived_by) FROM stdin;
\.


--
-- TOC entry 5876 (class 0 OID 93027)
-- Dependencies: 221
-- Data for Name: academic_year_notification_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.academic_year_notification_logs (id, institution_id, academic_year, recipient, status, sent_at, error, created_at) FROM stdin;
\.


--
-- TOC entry 5877 (class 0 OID 93042)
-- Dependencies: 222
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action_type, entity_type, entity_id, old_value, new_value, changed_fields, status, message, ip_address, user_agent, metadata, created_at, browser_name, session_id) FROM stdin;
\.


--
-- TOC entry 5878 (class 0 OID 93050)
-- Dependencies: 223
-- Data for Name: block_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.block_comments (id, block_id, section_id, parent_id, body, is_resolved, resolved_by, resolved_at, created_by, updated_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- TOC entry 5879 (class 0 OID 93059)
-- Dependencies: 224
-- Data for Name: block_translations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.block_translations (id, block_id, language, content, status, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5880 (class 0 OID 93070)
-- Dependencies: 225
-- Data for Name: branding_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.branding_assignments (id, report_id, asset_type, user_id, asset_url, assigned_by, assigned_at) FROM stdin;
\.


--
-- TOC entry 5881 (class 0 OID 93078)
-- Dependencies: 226
-- Data for Name: builder_approvals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.builder_approvals (id, section_id, reviewer_id, decision, comments, version_num, created_at) FROM stdin;
\.


--
-- TOC entry 5882 (class 0 OID 93086)
-- Dependencies: 227
-- Data for Name: builder_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.builder_attachments (id, report_id, section_id, block_id, file_name, file_size, mime_type, storage_path, uploaded_by, created_at, checksum) FROM stdin;
\.


--
-- TOC entry 5883 (class 0 OID 93117)
-- Dependencies: 228
-- Data for Name: compiled_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compiled_reports (id, report_id, language, format, storage_path, file_size, checksum, compile_options, included_sections, compiled_at, compiled_by) FROM stdin;
\.


--
-- TOC entry 5884 (class 0 OID 93137)
-- Dependencies: 229
-- Data for Name: custom_field_schemas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_field_schemas (id, form_name, institution_id, year, schema, is_active, used_column_names, created_at, created_by, updated_by, source_form_id, source_institution_id, published_at, schema_snapshot_version) FROM stdin;
\.


--
-- TOC entry 5885 (class 0 OID 93146)
-- Dependencies: 230
-- Data for Name: cycle_department_deadlines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cycle_department_deadlines (id, cycle_id, department_id, submission_deadline, review_deadline, created_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5886 (class 0 OID 93152)
-- Dependencies: 231
-- Data for Name: dashboard_kpi; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboard_kpi (id, kpi_config_id, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5888 (class 0 OID 93160)
-- Dependencies: 233
-- Data for Name: data_sources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.data_sources (id, institution_id, name, description, source_type, query, connection_id, params, column_map, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5889 (class 0 OID 93180)
-- Dependencies: 234
-- Data for Name: department_form_deadline_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_form_deadline_config (id, department_form_id, institution_id, department_id, academic_year, deadline_at, is_locked, auto_locked, locked_at, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5890 (class 0 OID 93188)
-- Dependencies: 235
-- Data for Name: department_form_lock_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_form_lock_config (id, department_form_id, department_id, deadline, is_locked, auto_locked, locked_by, locked_at, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5891 (class 0 OID 93196)
-- Dependencies: 236
-- Data for Name: department_form_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_form_roles (id, department_form_id, role_name, created_at, institution_id, department_id, academic_year, role_id) FROM stdin;
\.


--
-- TOC entry 5892 (class 0 OID 93203)
-- Dependencies: 237
-- Data for Name: department_form_year_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_form_year_mapping (id, department_form_id, academic_year, status, is_archived, is_active, is_locked, created_at) FROM stdin;
\.


--
-- TOC entry 5893 (class 0 OID 93214)
-- Dependencies: 238
-- Data for Name: department_table_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_table_list (id, form_name, form_description, department_id, institution_id, academic_year, visibility, translate_enabled, deadline_enabled, is_locked, is_archived, schema, used_column_names, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5894 (class 0 OID 93227)
-- Dependencies: 239
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (department_id, institution_id, name, code, status, created_at, updated_at, created_by, updated_by, name_hi) FROM stdin;
\.


--
-- TOC entry 5895 (class 0 OID 93252)
-- Dependencies: 240
-- Data for Name: email_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_queue (id, event_id, recipient_email, recipient_user_id, payload, status, attempts, max_attempts, last_attempted_at, last_error, scheduled_at, processed_at, created_at) FROM stdin;
\.


--
-- TOC entry 5896 (class 0 OID 93281)
-- Dependencies: 241
-- Data for Name: form_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_assignments (id, form_id, form_name, institution_id, department_id, academic_year, assigned_by, assigned_to, role, is_active, assigned_at, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5897 (class 0 OID 93292)
-- Dependencies: 242
-- Data for Name: form_deadline_reminder_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_deadline_reminder_log (id, form_key, reminder_type, recipient_email, sent_at) FROM stdin;
\.


--
-- TOC entry 5898 (class 0 OID 93299)
-- Dependencies: 243
-- Data for Name: form_lock_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_lock_config (id, form_name, institution_id, is_locked, locked_by, locked_at, created_at, updated_at, deadline_at, auto_locked) FROM stdin;
\.


--
-- TOC entry 5899 (class 0 OID 93309)
-- Dependencies: 244
-- Data for Name: form_year_deadlines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_year_deadlines (id, form_name, institution_id, academic_year, deadline_at, is_locked, auto_locked, locked_at, locked_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5900 (class 0 OID 93350)
-- Dependencies: 245
-- Data for Name: institutions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.institutions (institution_id, institution_name, code, email_domain, address_line1, address_line2, city, state, country, pincode, status, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
\.


--
-- TOC entry 5901 (class 0 OID 93360)
-- Dependencies: 246
-- Data for Name: kpi_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.kpi_config (id, title, description, table_name, x_col, y_cols, chart_type, row_limit, query, created_by, updated_by, created_at, updated_at, scope, institute_id, department_id, card_category, show_on_dashboard, dashboard_display_type, dashboard_group_name, academic_year, aggregation_type, group_by_column, export_title, title_hi, description_hi, export_title_hi) FROM stdin;
\.


--
-- TOC entry 5903 (class 0 OID 93382)
-- Dependencies: 248
-- Data for Name: kpi_svg_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.kpi_svg_reports (id, config_id, title, svg_data, report_data, created_at, exported_at, academic_year) FROM stdin;
\.


--
-- TOC entry 5905 (class 0 OID 93391)
-- Dependencies: 250
-- Data for Name: management_committees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.management_committees (id, institute_id, finance_year, committee_type, members, "position", contact, status, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5908 (class 0 OID 93403)
-- Dependencies: 253
-- Data for Name: new_share_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.new_share_records (id, form_name, institution_id, department_id, year, schema_id, status, order_index, custom_fields, language, source_row_id, created_by, updated_by, created_at, updated_at, reg_no) FROM stdin;
\.


--
-- TOC entry 5909 (class 0 OID 93411)
-- Dependencies: 254
-- Data for Name: nodal_officer_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nodal_officer_assignments (id, institution_id, department_id, user_id, reporting_year, is_active, assigned_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5910 (class 0 OID 93420)
-- Dependencies: 255
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_templates (id, event_id, label, email_enabled, app_enabled, email_subject, email_body, app_message, updated_at, updated_by, role_group, category, is_active) FROM stdin;
b21d8b49-0fef-42f6-86ad-03962b9272c6	department_created	New Department Created	t	t	New Department Added — {DEPARTMENT_NAME}	Hi {FULL_NAME},\n\nA new department has been added to {INSTITUTION_NAME} on {APP_NAME}.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nYou can now assign users and forms to this department.\n\n— {APP_NAME} Team	Department "{DEPARTMENT_NAME}" has been added to {INSTITUTION_NAME}.	2026-05-02 23:56:32.656362	\N	institute_admin	Administration	t
939b1cc8-7f1b-4349-9e6a-ad3a5fd51cd5	account_suspended	Account Suspended	t	t	Your {AppName} account has been suspended	Hi {UserName},\n \nYour account on {AppName} has been suspended by an administrator.\n \nIf you believe this is a mistake, please contact your institution admin.\n \n— {AppName} Team	Your {AppName} account has been suspended. Contact your admin for assistance.	2026-05-02 14:58:03.528866	\N	system	Security	t
c9dba787-a976-4e2e-aaf6-028777c21af5	user_role_updated	User Role Updated	t	t	Your role on {AppName} has been updated	Hi {UserName},\n \nYour role on {AppName} has been updated to {NewRole}.\n \nIf you have any questions, please contact your administrator.\n \n— {AppName} Team	Your role on {AppName} has been updated to {NewRole}.	2026-05-02 23:17:26.88429	\N	super_admin	User Management	t
9a0aba62-6483-4e27-aa55-b71be3b0d818	password_reset	Password Reset	t	t	Reset Your Password — {APP_NAME}	Hi {FULL_NAME},\n\nWe received a request to reset your password for your {APP_NAME} account.\n\nClick the button below to reset your password. This link expires in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\n— {APP_NAME} Team		2026-05-02 14:58:03.528866	\N	system	Security	t
7d91cbda-d7be-441d-93d0-01de74c04112	import_completed	Bulk Import Completed	t	t	Bulk User Import Completed — {APP_NAME}	Hi {FULL_NAME},\n\nYour bulk user import on {APP_NAME} has finished processing.\n\n  Imported : {IMPORTED}\n  Skipped  : {SKIPPED}\n  Failed   : {FAILED}\n  Total    : {TOTAL}\n\nPlease log in to review the imported users.\n\n— {APP_NAME} Team	Bulk import completed: {IMPORTED} imported, {SKIPPED} skipped, {FAILED} failed.	2026-06-22 17:04:48.273556	\N	system	User Management	t
763d6d5f-65fa-4278-9ab6-c2f271784991	account_reactivated	Account Reactivated	t	t	Your {AppName} account has been reactivated	Hi {UserName},\n \nGreat news — your account on {AppName} has been reactivated.\n \nYou can now log in at: {LoginURL}\n \n— {AppName} Team	Your {AppName} account has been reactivated. You can now log in.	2026-05-02 14:58:03.528866	\N	system	Security	t
ee3c3044-b9de-4b5f-a06a-9cd788cf4c47	user_created	New User Created	t	t	Welcome to {AppName} — Your Account is Ready	Hi {UserName},\n \nAn account has been created for you on {AppName}.\n \n  Email Address : {Email}\n  Temp Password : {TempPassword}\n \nFor security, you will be required to set a new password on your first login.\n \nLog in here: {LoginURL}\n \nIf you did not expect this email, please contact support.\n \n— {AppName} Team	Welcome {UserName}! Your account on {AppName} is ready. Tap to log in.	2026-05-02 15:01:27.350228	\N	system	User Management	t
58631af8-6046-44df-b9d3-17e98c0f8542	nodal_officer_assigned	Nodal Officer Assigned	t	t	You have been assigned as Nodal Officer on {AppName}	Hi {UserName},\n \nYou have been assigned as a Nodal Officer for "{DepartmentName}" on {AppName}.\n \nLog in here: {LoginURL}\n \n— {AppName} Team	You have been assigned as Nodal Officer for "{DepartmentName}".	2026-05-02 23:19:01.19687	\N	department_admin	Team Management	t
01012079-13c1-4f91-9e24-57f7f2498d04	nodal_officer_removed	Nodal Officer Removed	t	t	Nodal officer removed from {AppName}	Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been removed.\n\nIf you believe this is a mistake, please contact your institution administrator.\n\n— {APP_NAME} Team	Your Nodal Officer assignment for {REPORTING_YEAR} has been removed.	2026-05-02 23:19:01.19687	\N	department_admin	Team Management	t
2d92eafc-2a24-43c3-a61d-00a4431ab4da	committee_created	Committee Created	t	t	Management Committee Added — {COMMITTEE_TYPE} ({FINANCE_YEAR})	Hi {FULL_NAME},\n\nA new management committee record has been created on {APP_NAME}.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\nPosition: {POSITION}\nInstitution: {INSTITUTION_NAME}\n\nPlease review the committee details in the system.\n\n— {APP_NAME} Team	Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been added.	2026-06-17 22:15:37.483389	\N	institute_admin	Administration	t
999c94f6-52d9-4a31-b523-a95c776a00f5	department_activated	Department Activated	t	t	Department Reactivated — {DEPARTMENT_NAME}	Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nUsers can now be assigned to this department.\n\n— {APP_NAME} Team	Department "{DEPARTMENT_NAME}" has been reactivated.	2026-06-18 21:06:37.347717	\N	institute_admin	Administration	t
8a2000a1-4135-4be5-86fd-2cbfb9b75214	department_deactivated	Department Deactivated	t	t	Department Deactivated — {DEPARTMENT_NAME}	Hi {FULL_NAME},\n\nThe department "{DEPARTMENT_NAME}" at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nDepartment: {DEPARTMENT_NAME}\nCode: {DEPARTMENT_CODE}\n\nNo new users can be assigned to this department while inactive.\n\n— {APP_NAME} Team	Department "{DEPARTMENT_NAME}" has been deactivated.	2026-06-18 21:06:37.347717	\N	institute_admin	Administration	t
32b0cdb5-803e-4a8e-b009-1c78854e3122	nodal_officer_activated	Nodal Officer Activated	t	t	Your Nodal Officer Assignment Has Been Reinstated — {REPORTING_YEAR}	Hi {FULL_NAME},\n\nYour Nodal Officer assignment for {REPORTING_YEAR} on {APP_NAME} has been reinstated.\n\nInstitution: {INSTITUTION_NAME}\nScope: {SCOPE}\n\nPlease log in to access your responsibilities.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team	Your Nodal Officer assignment for {REPORTING_YEAR} has been reinstated.	2026-06-18 21:06:37.347717	\N	department_admin	Team Management	t
b96edc3d-c879-4ea0-ac55-bf9a7b01e0d1	institution_created	Institution Created	t	t	New Institution Registered — {INSTITUTION_NAME}	Hi {FULL_NAME},\n\nA new institution has been successfully registered on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nEmail Domain: {EMAIL_DOMAIN}\nLocation: {CITY}, {STATE}\n\nYou can now onboard administrators and departments for this institution.\n\n— {APP_NAME} Team	Institution "{INSTITUTION_NAME}" has been registered.	2026-06-17 22:15:37.483389	\N	super_admin	Administration	t
f9ee51e4-83f0-49c6-a83f-8a978023c3af	institution_activated	Institution Activated	t	t	Institution Reactivated — {INSTITUTION_NAME}	Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been reactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAll associated users and departments are now active.\n\n— {APP_NAME} Team	Institution "{INSTITUTION_NAME}" has been reactivated.	2026-06-18 21:06:37.347717	\N	super_admin	Administration	t
718f3c39-333b-4ee0-adc7-84a6ef922c1b	institution_deactivated	Institution Deactivated	t	t	Institution Deactivated — {INSTITUTION_NAME}	Hi {FULL_NAME},\n\n{INSTITUTION_NAME} has been deactivated on {APP_NAME}.\n\nInstitution: {INSTITUTION_NAME}\nCode: {INSTITUTION_CODE}\nLocation: {CITY}, {STATE}\n\nAccess for users of this institution has been restricted.\n\n— {APP_NAME} Team	Institution "{INSTITUTION_NAME}" has been deactivated.	2026-06-18 21:06:37.347717	\N	super_admin	Administration	t
ccf225ff-eeb9-41eb-80db-7afed52fa4e4	academic_year_activated	Academic Year Activated	t	t	New Academic Year Activated — {ACADEMIC_YEAR}	Hi {FULL_NAME},\n\nAcademic Year {ACADEMIC_YEAR} has been activated for {INSTITUTION_NAME} on {APP_NAME}.\n\n{ACTIVE_FORMS_COUNT} form(s) are now available for submission. Please review your assigned forms and complete submissions before their deadlines.\n\nLog in to get started: {LOGIN_URL}\n\n— {APP_NAME} Team	Academic Year {ACADEMIC_YEAR} activated. {ACTIVE_FORMS_COUNT} form(s) available.	2026-06-18 23:29:20.63993	\N	system	Academic Year	t
6989fbd0-e296-4d25-850e-bed3af3b7578	institute_form_created	Institute Form Created	t	t	New Form Created — {FORM_NAME}	Hi {FULL_NAME},\n\nA new form has been created on {APP_NAME} for your institution.\n\nForm: {FORM_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nInstitution: {INSTITUTION_NAME}\nCreated By: {CREATED_BY}\nType: {FORM_TYPE}\nDeadline: {DEADLINE}\n\nPlease log in to review and manage this form.\n\n— {APP_NAME} Team	New form "{FORM_NAME}" has been created for {ACADEMIC_YEAR}.	2026-06-18 23:29:20.673905	\N	institute_admin	Forms	t
9afedd45-98cf-4b08-b667-51078122673d	department_form_created	Department Form Created	t	t	New Department Form — {FORM_NAME}	Hi {FULL_NAME},\n\nA new department form has been created on {APP_NAME}.\n\nForm: {FORM_NAME}\nDepartment: {DEPARTMENT_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nCreated By: {CREATED_BY}\nDeadline: {DEADLINE}\n\nPlease log in to review and complete this form before the deadline.\n\n— {APP_NAME} Team	New department form "{FORM_NAME}" created for {DEPARTMENT_NAME}.	2026-06-18 23:29:20.673905	\N	department_admin	Forms	t
ada3ecd1-cb77-4e72-a0b1-430046ba3b72	committee_activated	Committee Activated	t	t	Committee Reactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})	Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been reactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team	Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been reactivated.	2026-06-18 21:06:37.347717	\N	institute_admin	Administration	t
9b7d07f6-0d87-4a6c-8841-e318a9a9da63	committee_deactivated	Committee Deactivated	t	t	Committee Deactivated — {COMMITTEE_TYPE} ({FINANCE_YEAR})	Hi {FULL_NAME},\n\nThe {COMMITTEE_TYPE} committee for {FINANCE_YEAR} at {INSTITUTION_NAME} on {APP_NAME} has been deactivated.\n\nCommittee Type: {COMMITTEE_TYPE}\nFinance Year: {FINANCE_YEAR}\n\n— {APP_NAME} Team	Committee "{COMMITTEE_TYPE}" for {FINANCE_YEAR} has been deactivated.	2026-06-18 21:06:37.347717	\N	institute_admin	Administration	t
f34d77df-b457-437a-88cd-054cef03b27c	form_deadline_reminder	Form Deadline Reminder	t	t	Deadline Reminder: {FORM_NAME} — {DAYS_REMAINING} day(s) left	Hi {FULL_NAME},\n\nThis is a reminder that the submission deadline for "{FORM_NAME}" is approaching on {APP_NAME}.\n\nForm: {FORM_NAME}\nDeadline: {DEADLINE}\nTime Remaining: {DAYS_REMAINING} day(s)\n\nPlease ensure all required submissions are completed before the deadline.\n\n— {APP_NAME} Team	Deadline reminder: "{FORM_NAME}" is due on {DEADLINE}.	2026-06-18 23:29:20.703162	\N	system	Forms	t
ea9863ec-a642-489c-a97b-1a9085ebc161	role_created	Role Created	t	t	New Role Created — {ROLE_DISPLAY_NAME}	Hi {FULL_NAME},\n\nA new custom role has been created on {APP_NAME}.\n\nRole: {ROLE_DISPLAY_NAME}\nIdentifier: {ROLE_NAME}\nDescription: {ROLE_DESCRIPTION}\n\n— {APP_NAME} Team	New role "{ROLE_DISPLAY_NAME}" has been created.	2026-06-18 21:06:37.347717	\N	super_admin	Administration	t
17c9797a-46fe-4396-bbf3-27498b95bde0	form_assigned	Form Assigned to Contributor	t	t	You Have Been Assigned a Form — {FORM_NAME}	Hi {FULL_NAME},\n\nA form has been assigned to you on {APP_NAME}.\n\nForm: {FORM_NAME}\nAcademic Year: {ACADEMIC_YEAR}\nAssigned By: {ASSIGNED_BY}\nDeadline: {DEADLINE}\n\nPlease log in and complete the form before the deadline.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team	Form "{FORM_NAME}" has been assigned to you for {ACADEMIC_YEAR}. Deadline: {DEADLINE}.	2026-06-24 18:41:51.025929	\N	contributor	Forms	t
d3b0d70b-ac36-4835-a5ca-7ed741893adf	form_locked	Form Locked	t	t	Form Locked — {FORM_NAME}	Hi {FULL_NAME},\n\nThe form "{FORM_NAME}" has been locked on {APP_NAME}. No further edits or submissions are possible.\n\nLocked By: {LOCKED_BY}\nInstitution: {INSTITUTION_NAME}\n\nIf you have any questions, please contact your administrator.\n\n— {APP_NAME} Team	Form "{FORM_NAME}" has been locked. No further submissions are accepted.	2026-06-24 18:41:51.025929	\N	contributor	Forms	t
3e59b899-bb80-4165-a922-bdf30e0dcaf1	form_submitted	Section Submitted for Review	t	t	Section Awaiting Review — {SECTION_NAME}	Hi {FULL_NAME},\n\nA section has been submitted for your review on {APP_NAME}.\n\nSection: {SECTION_NAME}\nSubmitted By: {SUBMITTED_BY}\nStep: {STEP_NAME}\n\nPlease log in to review and approve the section.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team	Section "{SECTION_NAME}" has been submitted and is awaiting your review at {STEP_NAME}.	2026-06-24 18:41:51.025929	\N	department_admin	Approvals	t
9934b28f-eb1d-40c1-a7e9-853b3b0f6435	form_approved	Section Approved	t	t	Your Section Has Been Approved — {SECTION_NAME}	Hi {FULL_NAME},\n\nGreat news! Your section "{SECTION_NAME}" has been approved on {APP_NAME}.\n\nApproved By: {APPROVED_BY}\n\nLog in to view the approval details.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team	Your section "{SECTION_NAME}" has been approved.	2026-06-24 18:41:51.025929	\N	contributor	Approvals	t
9e3a6695-2727-400b-a854-bca8e13ad5ec	form_rejected	Section Sent Back for Revision	t	t	Section Sent Back — {SECTION_NAME}	Hi {FULL_NAME},\n\nYour section "{SECTION_NAME}" has been sent back for revision on {APP_NAME}.\n\nReviewed By: {REVIEWER_NAME}\nFeedback: {COMMENT}\n\nPlease log in to make the required changes and resubmit.\n\n{LOGIN_URL}\n\n— {APP_NAME} Team	Section "{SECTION_NAME}" was sent back. Please revise and resubmit.	2026-06-24 18:41:51.025929	\N	contributor	Approvals	t
\.


--
-- TOC entry 5911 (class 0 OID 93433)
-- Dependencies: 256
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, event_id, title, message, is_read, created_at, type, body, entity_type, entity_id, read_at) FROM stdin;
\.


--
-- TOC entry 5913 (class 0 OID 93441)
-- Dependencies: 258
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- TOC entry 5914 (class 0 OID 93464)
-- Dependencies: 259
-- Data for Name: report_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_access (id, report_id, role_name, granted_by, granted_at, revoked_at) FROM stdin;
\.


--
-- TOC entry 5915 (class 0 OID 93469)
-- Dependencies: 260
-- Data for Name: report_audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_audit_log (id, institution_id, entity_type, entity_id, action, old_data, new_data, changed_fields, user_id, ip_address, user_agent, session_id, created_at) FROM stdin;
\.


--
-- TOC entry 5916 (class 0 OID 93476)
-- Dependencies: 261
-- Data for Name: report_department_deadlines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_department_deadlines (id, report_id, department_id, submission_deadline, review_deadline, approval_deadline, notes, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5917 (class 0 OID 93485)
-- Dependencies: 262
-- Data for Name: report_sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_sections (id, report_id, parent_id, title, description, order_index, status, version_lock, locked_by, locked_at, created_by, updated_by, created_at, updated_at, deleted_at, source_template_section_id, workflow_template_id, current_step_id, submission_deadline, review_deadline, data_source_id, approval_deadline) FROM stdin;
\.


--
-- TOC entry 5918 (class 0 OID 93497)
-- Dependencies: 263
-- Data for Name: report_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_templates (id, institution_id, name, description, report_type, version, default_workflow_id, status, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5919 (class 0 OID 93516)
-- Dependencies: 264
-- Data for Name: reporting_cycles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reporting_cycles (id, institution_id, name, description, start_date, end_date, reporting_year, submission_deadline, review_deadline, approval_deadline, status, closed_at, closed_by, archived_at, archived_by, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5920 (class 0 OID 93529)
-- Dependencies: 265
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, institution_id, title, report_type, academic_year, status, created_by, updated_by, created_at, updated_at, deleted_at, cover_image_url, logo_url, bg_image_url, cycle_id, template_id, is_locked, locked_at, locked_by, primary_language, description, submission_deadline, review_deadline, approval_deadline, default_workflow_id) FROM stdin;
\.


--
-- TOC entry 5921 (class 0 OID 93541)
-- Dependencies: 266
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, display_name, description, permissions, is_system, created_at, updated_at) FROM stdin;
1228e7ec-3a62-42ec-8f41-a4ccf957e40f	super_admin	Super Admin	Full system access	{"all": true}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
f523afbc-8708-455a-b2c7-1a627036b9e5	publication_cell	Publication Cell	Manages publications pipeline	{"publications": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
d631d5fd-0366-4358-82fb-2cc8535d7193	department_admin	Department Admin	Manages department settings	{"department": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
c29dcf81-6d8f-4f7f-a2ac-85bd7b7b012b	nodal_officer	Department Nodal Officer	Nodal officer access	{"reports": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
2aebfd43-49c6-4026-8869-ee20fbf5aa50	reviewer	Reviewer	Can review submissions	{"publications": ["review"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
ae958c00-cf08-47b6-b802-faefbebf2c53	directors_office	Director's Office	Director-level read access	{"all": ["read"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
eb21df23-350b-449d-bec8-37395c85107e	institute_admin	Institute Admin	Manages institution-level settings	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": true, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": false, "fill_finance_forms": false, "manage_departments": true, "configure_templates": false, "manage_institutions": false, "fill_institute_forms": true, "assign_roles_institute": false}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
cfb457bb-d6e9-487f-8c87-05e81666a87e	finance_admin	Finance Admin	Manages Finance-domain forms and data	{}	t	2026-06-14 16:03:11.195514+05:30	2026-06-14 16:03:11.195514+05:30
075d34f9-4964-4fd8-8447-a1bb03fb313a	hospital_admin	Hospital Admin	Manages Hospital-domain forms and data	{}	t	2026-06-14 16:03:11.195514+05:30	2026-06-14 16:03:11.195514+05:30
c3dbd707-7286-4863-870b-f55195f9c70f	contributor	Contributor	Can submit publications	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": false, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": false, "fill_finance_forms": false, "manage_departments": true, "configure_templates": false, "manage_institutions": false, "fill_institute_forms": false, "assign_roles_institute": true}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
\.


--
-- TOC entry 5922 (class 0 OID 93551)
-- Dependencies: 267
-- Data for Name: schema_propagation_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_propagation_log (id, form_name, institution_id, academic_year, action, created_at) FROM stdin;
\.


--
-- TOC entry 5923 (class 0 OID 93558)
-- Dependencies: 268
-- Data for Name: section_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_access (id, section_id, user_id, role_name, permission, granted_by, granted_at, revoked_at, department_id) FROM stdin;
\.


--
-- TOC entry 5924 (class 0 OID 93566)
-- Dependencies: 269
-- Data for Name: section_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_assignments (id, section_id, user_id, role, assigned_by, assigned_at, completed_at, due_at, notified_at) FROM stdin;
\.


--
-- TOC entry 5925 (class 0 OID 93573)
-- Dependencies: 270
-- Data for Name: section_blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_blocks (id, section_id, block_type, order_index, content, created_by, updated_by, created_at, updated_at, deleted_at, source_template_block_id, data_source_id, is_required) FROM stdin;
\.


--
-- TOC entry 5926 (class 0 OID 93585)
-- Dependencies: 271
-- Data for Name: section_department_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_department_assignments (id, section_id, department_id, assigned_by, due_at, assigned_at) FROM stdin;
\.


--
-- TOC entry 5927 (class 0 OID 93590)
-- Dependencies: 272
-- Data for Name: section_signoffs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_signoffs (id, section_id, workflow_step_id, reviewer_id, decision, version_num, comment, signed_at) FROM stdin;
\.


--
-- TOC entry 5928 (class 0 OID 93598)
-- Dependencies: 273
-- Data for Name: section_translations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_translations (id, section_id, language, title, description, status, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5929 (class 0 OID 93608)
-- Dependencies: 274
-- Data for Name: section_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_versions (id, section_id, version_num, event, snapshot, created_by, created_at, workflow_step_id, reviewer_id, decision, reviewer_comment, latest_decision, latest_decision_by, latest_decision_at, latest_decision_step_id, description) FROM stdin;
\.


--
-- TOC entry 5930 (class 0 OID 93618)
-- Dependencies: 275
-- Data for Name: section_workflow_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.section_workflow_assignments (id, report_id, section_id, workflow_step_id, assignee_type, user_id, department_id, role_name, due_at, assigned_by, assigned_at, completed_at, notified_at) FROM stdin;
\.


--
-- TOC entry 5931 (class 0 OID 93633)
-- Dependencies: 276
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, user_id, token_hash, previous_token_hash, expires_at, created_at, last_used_at) FROM stdin;
\.


--
-- TOC entry 5932 (class 0 OID 93649)
-- Dependencies: 277
-- Data for Name: shared_form_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shared_form_snapshots (id, source_form_id, version, form_name, schema, used_column_names, created_by, published_at) FROM stdin;
\.


--
-- TOC entry 5933 (class 0 OID 93665)
-- Dependencies: 278
-- Data for Name: table_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.table_list (id, form_name, institute_access, share_table, created_by, updated_by, created_at, updated_at, translate_to_hindi, form_domain) FROM stdin;
\.


--
-- TOC entry 5934 (class 0 OID 93675)
-- Dependencies: 279
-- Data for Name: template_blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.template_blocks (id, template_section_id, block_type, order_index, default_content, data_source_id, is_required, created_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5935 (class 0 OID 93687)
-- Dependencies: 280
-- Data for Name: template_sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.template_sections (id, template_id, parent_id, title, description, order_index, workflow_template_id, data_source_id, created_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5936 (class 0 OID 93704)
-- Dependencies: 281
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (id, user_id, role_id, assigned_by, assigned_at, expires_at, revoked_at) FROM stdin;
\.


--
-- TOC entry 5937 (class 0 OID 93709)
-- Dependencies: 282
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, institution_id, department_id, full_name, email, password_hash, profile_image_url, must_change_password, last_login_at, password_changed_at, account_status, created_by, created_at, token_version, is_temporary_password, role_domain) FROM stdin;
\.


--
-- TOC entry 5938 (class 0 OID 93721)
-- Dependencies: 283
-- Data for Name: workflow_steps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflow_steps (id, template_id, step_order, step_name, approver_role, approver_user_id, approver_department_id) FROM stdin;
\.


--
-- TOC entry 5939 (class 0 OID 93728)
-- Dependencies: 284
-- Data for Name: workflow_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflow_templates (id, institution_id, name, description, is_default, created_by, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5952 (class 0 OID 0)
-- Dependencies: 232
-- Name: dashboard_kpi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dashboard_kpi_id_seq', 1, false);


--
-- TOC entry 5953 (class 0 OID 0)
-- Dependencies: 247
-- Name: kpi_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kpi_config_id_seq', 1, false);


--
-- TOC entry 5954 (class 0 OID 0)
-- Dependencies: 249
-- Name: kpi_svg_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kpi_svg_reports_id_seq', 1, false);


--
-- TOC entry 5955 (class 0 OID 0)
-- Dependencies: 251
-- Name: management_committees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.management_committees_id_seq', 1, false);


--
-- TOC entry 5956 (class 0 OID 0)
-- Dependencies: 252
-- Name: management_committees_id_seq1; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.management_committees_id_seq1', 1, false);


--
-- TOC entry 5957 (class 0 OID 0)
-- Dependencies: 257
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- TOC entry 5360 (class 2606 OID 93745)
-- Name: academic_year_form_config academic_year_form_config_institution_id_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_year_form_config
    ADD CONSTRAINT academic_year_form_config_institution_id_academic_year_key UNIQUE (institution_id, academic_year);


--
-- TOC entry 5362 (class 2606 OID 93747)
-- Name: academic_year_form_config academic_year_form_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_year_form_config
    ADD CONSTRAINT academic_year_form_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5365 (class 2606 OID 93749)
-- Name: academic_year_master academic_year_master_institution_id_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_year_master
    ADD CONSTRAINT academic_year_master_institution_id_academic_year_key UNIQUE (institution_id, academic_year);


--
-- TOC entry 5367 (class 2606 OID 93751)
-- Name: academic_year_master academic_year_master_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_year_master
    ADD CONSTRAINT academic_year_master_pkey PRIMARY KEY (id);


--
-- TOC entry 5370 (class 2606 OID 93753)
-- Name: academic_year_notification_logs academic_year_notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_year_notification_logs
    ADD CONSTRAINT academic_year_notification_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5373 (class 2606 OID 93757)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5385 (class 2606 OID 93759)
-- Name: block_comments block_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_comments
    ADD CONSTRAINT block_comments_pkey PRIMARY KEY (id);


--
-- TOC entry 5389 (class 2606 OID 93761)
-- Name: block_translations block_translations_block_id_language_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_translations
    ADD CONSTRAINT block_translations_block_id_language_key UNIQUE (block_id, language);


--
-- TOC entry 5391 (class 2606 OID 93763)
-- Name: block_translations block_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_translations
    ADD CONSTRAINT block_translations_pkey PRIMARY KEY (id);


--
-- TOC entry 5394 (class 2606 OID 93765)
-- Name: branding_assignments branding_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branding_assignments
    ADD CONSTRAINT branding_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5396 (class 2606 OID 93767)
-- Name: branding_assignments branding_assignments_report_id_asset_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branding_assignments
    ADD CONSTRAINT branding_assignments_report_id_asset_type_key UNIQUE (report_id, asset_type);


--
-- TOC entry 5399 (class 2606 OID 93769)
-- Name: builder_approvals builder_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_approvals
    ADD CONSTRAINT builder_approvals_pkey PRIMARY KEY (id);


--
-- TOC entry 5402 (class 2606 OID 93771)
-- Name: builder_attachments builder_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_attachments
    ADD CONSTRAINT builder_attachments_pkey PRIMARY KEY (id);


--
-- TOC entry 5405 (class 2606 OID 93779)
-- Name: compiled_reports compiled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compiled_reports
    ADD CONSTRAINT compiled_reports_pkey PRIMARY KEY (id);


--
-- TOC entry 5408 (class 2606 OID 93783)
-- Name: custom_field_schemas custom_field_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_schemas
    ADD CONSTRAINT custom_field_schemas_pkey PRIMARY KEY (id);


--
-- TOC entry 5410 (class 2606 OID 93785)
-- Name: cycle_department_deadlines cycle_department_deadlines_cycle_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cycle_department_deadlines
    ADD CONSTRAINT cycle_department_deadlines_cycle_id_department_id_key UNIQUE (cycle_id, department_id);


--
-- TOC entry 5412 (class 2606 OID 93787)
-- Name: cycle_department_deadlines cycle_department_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cycle_department_deadlines
    ADD CONSTRAINT cycle_department_deadlines_pkey PRIMARY KEY (id);


--
-- TOC entry 5415 (class 2606 OID 93789)
-- Name: dashboard_kpi dashboard_kpi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_kpi
    ADD CONSTRAINT dashboard_kpi_pkey PRIMARY KEY (id);


--
-- TOC entry 5417 (class 2606 OID 93791)
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- TOC entry 5420 (class 2606 OID 93795)
-- Name: department_form_deadline_config department_form_deadline_conf_department_form_id_academic_y_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_deadline_config
    ADD CONSTRAINT department_form_deadline_conf_department_form_id_academic_y_key UNIQUE (department_form_id, academic_year);


--
-- TOC entry 5422 (class 2606 OID 93797)
-- Name: department_form_deadline_config department_form_deadline_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_deadline_config
    ADD CONSTRAINT department_form_deadline_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5425 (class 2606 OID 93799)
-- Name: department_form_lock_config department_form_lock_config_department_form_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_lock_config
    ADD CONSTRAINT department_form_lock_config_department_form_id_key UNIQUE (department_form_id);


--
-- TOC entry 5427 (class 2606 OID 93801)
-- Name: department_form_lock_config department_form_lock_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_lock_config
    ADD CONSTRAINT department_form_lock_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5429 (class 2606 OID 93803)
-- Name: department_form_roles department_form_roles_department_form_id_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_roles
    ADD CONSTRAINT department_form_roles_department_form_id_role_name_key UNIQUE (department_form_id, role_name);


--
-- TOC entry 5431 (class 2606 OID 93805)
-- Name: department_form_roles department_form_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_roles
    ADD CONSTRAINT department_form_roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5433 (class 2606 OID 93807)
-- Name: department_form_year_mapping department_form_year_mapping_department_form_id_academic_ye_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_year_mapping
    ADD CONSTRAINT department_form_year_mapping_department_form_id_academic_ye_key UNIQUE (department_form_id, academic_year);


--
-- TOC entry 5435 (class 2606 OID 93809)
-- Name: department_form_year_mapping department_form_year_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_year_mapping
    ADD CONSTRAINT department_form_year_mapping_pkey PRIMARY KEY (id);


--
-- TOC entry 5437 (class 2606 OID 93811)
-- Name: department_table_list department_table_list_department_id_form_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_table_list
    ADD CONSTRAINT department_table_list_department_id_form_name_key UNIQUE (department_id, form_name);


--
-- TOC entry 5439 (class 2606 OID 93813)
-- Name: department_table_list department_table_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_table_list
    ADD CONSTRAINT department_table_list_pkey PRIMARY KEY (id);


--
-- TOC entry 5441 (class 2606 OID 93815)
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (department_id);


--
-- TOC entry 5445 (class 2606 OID 93821)
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- TOC entry 5448 (class 2606 OID 93827)
-- Name: form_assignments form_assignments_form_id_assigned_to_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_assignments
    ADD CONSTRAINT form_assignments_form_id_assigned_to_academic_year_key UNIQUE (form_id, assigned_to, academic_year);


--
-- TOC entry 5450 (class 2606 OID 93829)
-- Name: form_assignments form_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_assignments
    ADD CONSTRAINT form_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5454 (class 2606 OID 93831)
-- Name: form_deadline_reminder_log form_deadline_reminder_log_form_key_reminder_type_recipient_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_deadline_reminder_log
    ADD CONSTRAINT form_deadline_reminder_log_form_key_reminder_type_recipient_key UNIQUE (form_key, reminder_type, recipient_email);


--
-- TOC entry 5456 (class 2606 OID 93833)
-- Name: form_deadline_reminder_log form_deadline_reminder_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_deadline_reminder_log
    ADD CONSTRAINT form_deadline_reminder_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5458 (class 2606 OID 93835)
-- Name: form_lock_config form_lock_config_form_name_institution_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_form_name_institution_id_key UNIQUE (form_name, institution_id);


--
-- TOC entry 5460 (class 2606 OID 93837)
-- Name: form_lock_config form_lock_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5462 (class 2606 OID 93839)
-- Name: form_year_deadlines form_year_deadlines_form_name_institution_id_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_year_deadlines
    ADD CONSTRAINT form_year_deadlines_form_name_institution_id_academic_year_key UNIQUE (form_name, institution_id, academic_year);


--
-- TOC entry 5464 (class 2606 OID 93841)
-- Name: form_year_deadlines form_year_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_year_deadlines
    ADD CONSTRAINT form_year_deadlines_pkey PRIMARY KEY (id);


--
-- TOC entry 5467 (class 2606 OID 93849)
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (institution_id);


--
-- TOC entry 5474 (class 2606 OID 93851)
-- Name: kpi_config kpi_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_config
    ADD CONSTRAINT kpi_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5477 (class 2606 OID 93855)
-- Name: kpi_svg_reports kpi_svg_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_svg_reports
    ADD CONSTRAINT kpi_svg_reports_pkey PRIMARY KEY (id);


--
-- TOC entry 5482 (class 2606 OID 93857)
-- Name: management_committees management_committees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.management_committees
    ADD CONSTRAINT management_committees_pkey PRIMARY KEY (id);


--
-- TOC entry 5487 (class 2606 OID 93859)
-- Name: new_share_records new_share_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.new_share_records
    ADD CONSTRAINT new_share_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5489 (class 2606 OID 93861)
-- Name: nodal_officer_assignments nodal_officer_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodal_officer_assignments
    ADD CONSTRAINT nodal_officer_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5491 (class 2606 OID 93863)
-- Name: notification_templates notification_templates_event_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_event_id_key UNIQUE (event_id);


--
-- TOC entry 5493 (class 2606 OID 93865)
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 5496 (class 2606 OID 93867)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5499 (class 2606 OID 93869)
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5501 (class 2606 OID 93871)
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 5504 (class 2606 OID 93877)
-- Name: report_access report_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_access
    ADD CONSTRAINT report_access_pkey PRIMARY KEY (id);


--
-- TOC entry 5506 (class 2606 OID 93879)
-- Name: report_access report_access_report_id_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_access
    ADD CONSTRAINT report_access_report_id_role_name_key UNIQUE (report_id, role_name);


--
-- TOC entry 5511 (class 2606 OID 93881)
-- Name: report_audit_log report_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_audit_log
    ADD CONSTRAINT report_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5515 (class 2606 OID 93883)
-- Name: report_department_deadlines report_department_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_department_deadlines
    ADD CONSTRAINT report_department_deadlines_pkey PRIMARY KEY (id);


--
-- TOC entry 5517 (class 2606 OID 93885)
-- Name: report_department_deadlines report_department_deadlines_report_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_department_deadlines
    ADD CONSTRAINT report_department_deadlines_report_id_department_id_key UNIQUE (report_id, department_id);


--
-- TOC entry 5522 (class 2606 OID 93887)
-- Name: report_sections report_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_pkey PRIMARY KEY (id);


--
-- TOC entry 5526 (class 2606 OID 93889)
-- Name: report_templates report_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 5529 (class 2606 OID 93893)
-- Name: reporting_cycles reporting_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reporting_cycles
    ADD CONSTRAINT reporting_cycles_pkey PRIMARY KEY (id);


--
-- TOC entry 5535 (class 2606 OID 93895)
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- TOC entry 5537 (class 2606 OID 93897)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5539 (class 2606 OID 93899)
-- Name: schema_propagation_log schema_propagation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_propagation_log
    ADD CONSTRAINT schema_propagation_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5544 (class 2606 OID 93901)
-- Name: section_access section_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_access
    ADD CONSTRAINT section_access_pkey PRIMARY KEY (id);


--
-- TOC entry 5547 (class 2606 OID 93903)
-- Name: section_assignments section_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_assignments
    ADD CONSTRAINT section_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5549 (class 2606 OID 93905)
-- Name: section_assignments section_assignments_section_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_assignments
    ADD CONSTRAINT section_assignments_section_id_user_id_key UNIQUE (section_id, user_id);


--
-- TOC entry 5554 (class 2606 OID 93907)
-- Name: section_blocks section_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_blocks
    ADD CONSTRAINT section_blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 5558 (class 2606 OID 93909)
-- Name: section_department_assignments section_department_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_department_assignments
    ADD CONSTRAINT section_department_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5560 (class 2606 OID 93911)
-- Name: section_department_assignments section_department_assignments_section_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_department_assignments
    ADD CONSTRAINT section_department_assignments_section_id_department_id_key UNIQUE (section_id, department_id);


--
-- TOC entry 5565 (class 2606 OID 93913)
-- Name: section_signoffs section_signoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_signoffs
    ADD CONSTRAINT section_signoffs_pkey PRIMARY KEY (id);


--
-- TOC entry 5568 (class 2606 OID 93915)
-- Name: section_translations section_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_translations
    ADD CONSTRAINT section_translations_pkey PRIMARY KEY (id);


--
-- TOC entry 5570 (class 2606 OID 93917)
-- Name: section_translations section_translations_section_id_language_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_translations
    ADD CONSTRAINT section_translations_section_id_language_key UNIQUE (section_id, language);


--
-- TOC entry 5573 (class 2606 OID 93919)
-- Name: section_versions section_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_versions
    ADD CONSTRAINT section_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 5575 (class 2606 OID 93921)
-- Name: section_versions section_versions_section_id_version_num_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_versions
    ADD CONSTRAINT section_versions_section_id_version_num_key UNIQUE (section_id, version_num);


--
-- TOC entry 5584 (class 2606 OID 93923)
-- Name: section_workflow_assignments section_workflow_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5586 (class 2606 OID 93925)
-- Name: section_workflow_assignments section_workflow_assignments_section_id_workflow_step_id_as_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_section_id_workflow_step_id_as_key UNIQUE NULLS NOT DISTINCT (section_id, workflow_step_id, assignee_type, user_id, department_id, role_name);


--
-- TOC entry 5591 (class 2606 OID 93929)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5593 (class 2606 OID 93931)
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 5595 (class 2606 OID 93935)
-- Name: shared_form_snapshots shared_form_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shared_form_snapshots
    ADD CONSTRAINT shared_form_snapshots_pkey PRIMARY KEY (id);


--
-- TOC entry 5597 (class 2606 OID 93937)
-- Name: shared_form_snapshots shared_form_snapshots_source_form_id_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shared_form_snapshots
    ADD CONSTRAINT shared_form_snapshots_source_form_id_version_key UNIQUE (source_form_id, version);


--
-- TOC entry 5599 (class 2606 OID 93941)
-- Name: table_list table_list_form_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_list
    ADD CONSTRAINT table_list_form_name_key UNIQUE (form_name);


--
-- TOC entry 5601 (class 2606 OID 93943)
-- Name: table_list table_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_list
    ADD CONSTRAINT table_list_pkey PRIMARY KEY (id);


--
-- TOC entry 5604 (class 2606 OID 93945)
-- Name: template_blocks template_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_blocks
    ADD CONSTRAINT template_blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 5608 (class 2606 OID 93947)
-- Name: template_sections template_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_pkey PRIMARY KEY (id);


--
-- TOC entry 5612 (class 2606 OID 93951)
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5617 (class 2606 OID 93953)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5621 (class 2606 OID 93955)
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- TOC entry 5623 (class 2606 OID 93957)
-- Name: workflow_steps workflow_steps_template_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_template_id_step_order_key UNIQUE (template_id, step_order);


--
-- TOC entry 5626 (class 2606 OID 93959)
-- Name: workflow_templates workflow_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 5400 (class 1259 OID 93960)
-- Name: idx_approvals_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_approvals_section ON public.builder_approvals USING btree (section_id, created_at DESC);


--
-- TOC entry 5545 (class 1259 OID 93961)
-- Name: idx_assignments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_user ON public.section_assignments USING btree (user_id);


--
-- TOC entry 5403 (class 1259 OID 93962)
-- Name: idx_attachments_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attachments_report ON public.builder_attachments USING btree (report_id);


--
-- TOC entry 5374 (class 1259 OID 93965)
-- Name: idx_audit_action_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_action_type ON public.audit_logs USING btree (action_type);


--
-- TOC entry 5375 (class 1259 OID 93966)
-- Name: idx_audit_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- TOC entry 5376 (class 1259 OID 93967)
-- Name: idx_audit_entity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity_id ON public.audit_logs USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- TOC entry 5377 (class 1259 OID 93968)
-- Name: idx_audit_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity_type ON public.audit_logs USING btree (entity_type);


--
-- TOC entry 5378 (class 1259 OID 93969)
-- Name: idx_audit_entity_type_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity_type_created_at ON public.audit_logs USING btree (entity_type, created_at DESC);


--
-- TOC entry 5379 (class 1259 OID 93970)
-- Name: idx_audit_ip_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_ip_address ON public.audit_logs USING btree (ip_address);


--
-- TOC entry 5380 (class 1259 OID 93971)
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- TOC entry 5381 (class 1259 OID 93972)
-- Name: idx_audit_logs_role_events; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_role_events ON public.audit_logs USING btree (entity_type, entity_id, created_at DESC) WHERE (entity_type = 'ROLE'::text);


--
-- TOC entry 5382 (class 1259 OID 93973)
-- Name: idx_audit_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_session_id ON public.audit_logs USING btree (session_id);


--
-- TOC entry 5383 (class 1259 OID 93974)
-- Name: idx_audit_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_user_id ON public.audit_logs USING btree (user_id);


--
-- TOC entry 5363 (class 1259 OID 93975)
-- Name: idx_ayfc_inst_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ayfc_inst_year ON public.academic_year_form_config USING btree (institution_id, academic_year);


--
-- TOC entry 5368 (class 1259 OID 93976)
-- Name: idx_aym_inst_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_aym_inst_active ON public.academic_year_master USING btree (institution_id, active);


--
-- TOC entry 5371 (class 1259 OID 93977)
-- Name: idx_aynl_inst_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_aynl_inst_year ON public.academic_year_notification_logs USING btree (institution_id, academic_year);


--
-- TOC entry 5392 (class 1259 OID 93978)
-- Name: idx_blk_translations_block; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blk_translations_block ON public.block_translations USING btree (block_id);


--
-- TOC entry 5551 (class 1259 OID 93979)
-- Name: idx_blocks_content_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blocks_content_gin ON public.section_blocks USING gin (content) WHERE (deleted_at IS NULL);


--
-- TOC entry 5552 (class 1259 OID 93980)
-- Name: idx_blocks_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blocks_section ON public.section_blocks USING btree (section_id, order_index) WHERE (deleted_at IS NULL);


--
-- TOC entry 5397 (class 1259 OID 93981)
-- Name: idx_branding_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branding_user ON public.branding_assignments USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 5386 (class 1259 OID 93984)
-- Name: idx_comments_block; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comments_block ON public.block_comments USING btree (block_id) WHERE (deleted_at IS NULL);


--
-- TOC entry 5387 (class 1259 OID 93985)
-- Name: idx_comments_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comments_section ON public.block_comments USING btree (section_id) WHERE (deleted_at IS NULL);


--
-- TOC entry 5406 (class 1259 OID 93986)
-- Name: idx_compiled_report_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compiled_report_report ON public.compiled_reports USING btree (report_id, compiled_at DESC);


--
-- TOC entry 5413 (class 1259 OID 93987)
-- Name: idx_cycle_dept_deadlines; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cycle_dept_deadlines ON public.cycle_department_deadlines USING btree (cycle_id);


--
-- TOC entry 5527 (class 1259 OID 93988)
-- Name: idx_cycles_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cycles_institution ON public.reporting_cycles USING btree (institution_id, status);


--
-- TOC entry 5418 (class 1259 OID 93989)
-- Name: idx_data_sources_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_sources_institution ON public.data_sources USING btree (institution_id);


--
-- TOC entry 5423 (class 1259 OID 93992)
-- Name: idx_dfdc_form_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dfdc_form_year ON public.department_form_deadline_config USING btree (department_form_id, academic_year);


--
-- TOC entry 5446 (class 1259 OID 93995)
-- Name: idx_email_queue_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_queue_pending ON public.email_queue USING btree (scheduled_at) WHERE ((status)::text = 'pending'::text);


--
-- TOC entry 5451 (class 1259 OID 93996)
-- Name: idx_fa_assignee_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fa_assignee_year ON public.form_assignments USING btree (assigned_to, academic_year, is_active);


--
-- TOC entry 5452 (class 1259 OID 93997)
-- Name: idx_fa_form_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fa_form_year ON public.form_assignments USING btree (form_id, academic_year);


--
-- TOC entry 5465 (class 1259 OID 93998)
-- Name: idx_fyd_form_inst_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fyd_form_inst_year ON public.form_year_deadlines USING btree (form_name, institution_id, academic_year);


--
-- TOC entry 5470 (class 1259 OID 93999)
-- Name: idx_kpi_config_dashboard; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kpi_config_dashboard ON public.kpi_config USING btree (show_on_dashboard) WHERE (show_on_dashboard = true);


--
-- TOC entry 5471 (class 1259 OID 94000)
-- Name: idx_kpi_config_scope_dept; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kpi_config_scope_dept ON public.kpi_config USING btree (scope, department_id) WHERE ((scope)::text = 'department'::text);


--
-- TOC entry 5472 (class 1259 OID 94001)
-- Name: idx_kpi_config_scope_inst; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kpi_config_scope_inst ON public.kpi_config USING btree (scope, institute_id) WHERE ((scope)::text = 'institute'::text);


--
-- TOC entry 5475 (class 1259 OID 94002)
-- Name: idx_kpi_svg_config_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kpi_svg_config_id ON public.kpi_svg_reports USING btree (config_id, exported_at DESC);


--
-- TOC entry 5478 (class 1259 OID 94003)
-- Name: idx_mc_institute_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_institute_year ON public.management_committees USING btree (institute_id, finance_year);


--
-- TOC entry 5479 (class 1259 OID 94004)
-- Name: idx_mc_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_status ON public.management_committees USING btree (status);


--
-- TOC entry 5480 (class 1259 OID 94005)
-- Name: idx_mc_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_type ON public.management_committees USING btree (committee_type);


--
-- TOC entry 5494 (class 1259 OID 94006)
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- TOC entry 5497 (class 1259 OID 94007)
-- Name: idx_prt_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prt_user ON public.password_reset_tokens USING btree (user_id);


--
-- TOC entry 5502 (class 1259 OID 94009)
-- Name: idx_report_access_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_access_report ON public.report_access USING btree (report_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5524 (class 1259 OID 94010)
-- Name: idx_report_templates_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_templates_institution ON public.report_templates USING btree (institution_id, status);


--
-- TOC entry 5530 (class 1259 OID 94011)
-- Name: idx_reports_cycle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_cycle ON public.reports USING btree (cycle_id) WHERE (deleted_at IS NULL);


--
-- TOC entry 5531 (class 1259 OID 94012)
-- Name: idx_reports_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_institution ON public.reports USING btree (institution_id) WHERE (deleted_at IS NULL);


--
-- TOC entry 5532 (class 1259 OID 94013)
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_status ON public.reports USING btree (institution_id, status) WHERE (deleted_at IS NULL);


--
-- TOC entry 5533 (class 1259 OID 94014)
-- Name: idx_reports_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_template ON public.reports USING btree (template_id) WHERE ((deleted_at IS NULL) AND (template_id IS NOT NULL));


--
-- TOC entry 5507 (class 1259 OID 94015)
-- Name: idx_rpt_audit_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rpt_audit_entity ON public.report_audit_log USING btree (entity_type, entity_id, created_at DESC);


--
-- TOC entry 5508 (class 1259 OID 94016)
-- Name: idx_rpt_audit_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rpt_audit_institution ON public.report_audit_log USING btree (institution_id, created_at DESC);


--
-- TOC entry 5509 (class 1259 OID 94017)
-- Name: idx_rpt_audit_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rpt_audit_user ON public.report_audit_log USING btree (user_id, created_at DESC);


--
-- TOC entry 5512 (class 1259 OID 94018)
-- Name: idx_rpt_dept_deadlines_dept; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rpt_dept_deadlines_dept ON public.report_department_deadlines USING btree (department_id);


--
-- TOC entry 5513 (class 1259 OID 94019)
-- Name: idx_rpt_dept_deadlines_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rpt_dept_deadlines_report ON public.report_department_deadlines USING btree (report_id);


--
-- TOC entry 5566 (class 1259 OID 94020)
-- Name: idx_sec_translations_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sec_translations_section ON public.section_translations USING btree (section_id);


--
-- TOC entry 5555 (class 1259 OID 94021)
-- Name: idx_sect_dept_assign_dept; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sect_dept_assign_dept ON public.section_department_assignments USING btree (department_id);


--
-- TOC entry 5556 (class 1259 OID 94022)
-- Name: idx_sect_dept_assign_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sect_dept_assign_section ON public.section_department_assignments USING btree (section_id);


--
-- TOC entry 5540 (class 1259 OID 94023)
-- Name: idx_section_access_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_section_access_department ON public.section_access USING btree (department_id) WHERE ((revoked_at IS NULL) AND (department_id IS NOT NULL));


--
-- TOC entry 5541 (class 1259 OID 94024)
-- Name: idx_section_access_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_section_access_section ON public.section_access USING btree (section_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5542 (class 1259 OID 94025)
-- Name: idx_section_access_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_section_access_user ON public.section_access USING btree (user_id) WHERE ((revoked_at IS NULL) AND (user_id IS NOT NULL));


--
-- TOC entry 5518 (class 1259 OID 94026)
-- Name: idx_sections_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sections_parent ON public.report_sections USING btree (parent_id) WHERE ((deleted_at IS NULL) AND (parent_id IS NOT NULL));


--
-- TOC entry 5519 (class 1259 OID 94027)
-- Name: idx_sections_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sections_report ON public.report_sections USING btree (report_id, order_index) WHERE (deleted_at IS NULL);


--
-- TOC entry 5520 (class 1259 OID 94028)
-- Name: idx_sections_template_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sections_template_source ON public.report_sections USING btree (source_template_section_id) WHERE (source_template_section_id IS NOT NULL);


--
-- TOC entry 5587 (class 1259 OID 94029)
-- Name: idx_sessions_prev_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_prev_hash ON public.sessions USING btree (previous_token_hash) WHERE (previous_token_hash IS NOT NULL);


--
-- TOC entry 5588 (class 1259 OID 94030)
-- Name: idx_sessions_token_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);


--
-- TOC entry 5589 (class 1259 OID 94031)
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- TOC entry 5561 (class 1259 OID 94032)
-- Name: idx_signoffs_reviewer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signoffs_reviewer ON public.section_signoffs USING btree (reviewer_id);


--
-- TOC entry 5562 (class 1259 OID 94033)
-- Name: idx_signoffs_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signoffs_section ON public.section_signoffs USING btree (section_id, signed_at DESC);


--
-- TOC entry 5563 (class 1259 OID 94034)
-- Name: idx_signoffs_step; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signoffs_step ON public.section_signoffs USING btree (workflow_step_id);


--
-- TOC entry 5576 (class 1259 OID 94037)
-- Name: idx_swa_authoring; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_authoring ON public.section_workflow_assignments USING btree (section_id) WHERE (workflow_step_id IS NULL);


--
-- TOC entry 5577 (class 1259 OID 94038)
-- Name: idx_swa_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_department ON public.section_workflow_assignments USING btree (department_id) WHERE (department_id IS NOT NULL);


--
-- TOC entry 5578 (class 1259 OID 94039)
-- Name: idx_swa_report; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_report ON public.section_workflow_assignments USING btree (report_id);


--
-- TOC entry 5579 (class 1259 OID 94040)
-- Name: idx_swa_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_role ON public.section_workflow_assignments USING btree (role_name) WHERE (role_name IS NOT NULL);


--
-- TOC entry 5580 (class 1259 OID 94041)
-- Name: idx_swa_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_section ON public.section_workflow_assignments USING btree (section_id);


--
-- TOC entry 5581 (class 1259 OID 94042)
-- Name: idx_swa_step; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_step ON public.section_workflow_assignments USING btree (workflow_step_id) WHERE (workflow_step_id IS NOT NULL);


--
-- TOC entry 5582 (class 1259 OID 94043)
-- Name: idx_swa_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_swa_user ON public.section_workflow_assignments USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 5602 (class 1259 OID 94044)
-- Name: idx_tmpl_blocks_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tmpl_blocks_section ON public.template_blocks USING btree (template_section_id, order_index);


--
-- TOC entry 5605 (class 1259 OID 94045)
-- Name: idx_tmpl_sections_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tmpl_sections_parent ON public.template_sections USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- TOC entry 5606 (class 1259 OID 94046)
-- Name: idx_tmpl_sections_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tmpl_sections_template ON public.template_sections USING btree (template_id, order_index);


--
-- TOC entry 5609 (class 1259 OID 94047)
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5613 (class 1259 OID 94048)
-- Name: idx_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_department ON public.users USING btree (department_id);


--
-- TOC entry 5614 (class 1259 OID 94049)
-- Name: idx_users_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_institution ON public.users USING btree (institution_id);


--
-- TOC entry 5571 (class 1259 OID 94050)
-- Name: idx_versions_section; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_versions_section ON public.section_versions USING btree (section_id, version_num DESC);


--
-- TOC entry 5618 (class 1259 OID 94051)
-- Name: idx_wf_steps_dept; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wf_steps_dept ON public.workflow_steps USING btree (approver_department_id) WHERE (approver_department_id IS NOT NULL);


--
-- TOC entry 5624 (class 1259 OID 94052)
-- Name: idx_wf_templates_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wf_templates_institution ON public.workflow_templates USING btree (institution_id);


--
-- TOC entry 5619 (class 1259 OID 94053)
-- Name: idx_workflow_steps_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workflow_steps_template ON public.workflow_steps USING btree (template_id, step_order);


--
-- TOC entry 5483 (class 1259 OID 94114)
-- Name: ix_new_share_records_ic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_new_share_records_ic ON public.new_share_records USING btree (institution_id, created_at DESC);


--
-- TOC entry 5484 (class 1259 OID 94115)
-- Name: ix_new_share_records_reg_no_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_new_share_records_reg_no_trgm ON public.new_share_records USING gin (reg_no public.gin_trgm_ops);


--
-- TOC entry 5485 (class 1259 OID 94116)
-- Name: ix_new_share_records_sr; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_new_share_records_sr ON public.new_share_records USING btree (source_row_id);


--
-- TOC entry 5442 (class 1259 OID 94142)
-- Name: uq_dept_code_per_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_dept_code_per_institution ON public.departments USING btree (institution_id, lower(code));


--
-- TOC entry 5443 (class 1259 OID 94143)
-- Name: uq_dept_name_per_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_dept_name_per_institution ON public.departments USING btree (institution_id, lower(name));


--
-- TOC entry 5468 (class 1259 OID 94144)
-- Name: uq_institution_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_institution_code ON public.institutions USING btree (lower(code));


--
-- TOC entry 5469 (class 1259 OID 94145)
-- Name: uq_institution_email_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_institution_email_domain ON public.institutions USING btree (lower(email_domain));


--
-- TOC entry 5523 (class 1259 OID 94146)
-- Name: uq_section_lock; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_section_lock ON public.report_sections USING btree (id) WHERE ((locked_by IS NOT NULL) AND (deleted_at IS NULL));


--
-- TOC entry 5550 (class 1259 OID 94147)
-- Name: uq_section_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_section_owner ON public.section_assignments USING btree (section_id) WHERE (((role)::text = 'OWNER'::text) AND (completed_at IS NULL));


--
-- TOC entry 5610 (class 1259 OID 94148)
-- Name: uq_user_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_user_role ON public.user_roles USING btree (user_id, role_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5615 (class 1259 OID 94149)
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (institution_id, lower(email)) WHERE (account_status = 'ACTIVE'::public.user_status);


--
-- TOC entry 5727 (class 2620 OID 94150)
-- Name: data_sources trg_data_sources_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_data_sources_upd BEFORE UPDATE ON public.data_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 5728 (class 2620 OID 94151)
-- Name: notifications trg_trim_notifications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_trim_notifications AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trim_user_notifications();


--
-- TOC entry 5627 (class 2606 OID 94152)
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5628 (class 2606 OID 94157)
-- Name: block_comments block_comments_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_comments
    ADD CONSTRAINT block_comments_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.section_blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5629 (class 2606 OID 94162)
-- Name: block_comments block_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_comments
    ADD CONSTRAINT block_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.block_comments(id) ON DELETE CASCADE;


--
-- TOC entry 5630 (class 2606 OID 94167)
-- Name: block_comments block_comments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_comments
    ADD CONSTRAINT block_comments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5631 (class 2606 OID 94172)
-- Name: block_comments block_comments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_comments
    ADD CONSTRAINT block_comments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5632 (class 2606 OID 94177)
-- Name: block_translations block_translations_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_translations
    ADD CONSTRAINT block_translations_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.section_blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5633 (class 2606 OID 94182)
-- Name: branding_assignments branding_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branding_assignments
    ADD CONSTRAINT branding_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5634 (class 2606 OID 94187)
-- Name: branding_assignments branding_assignments_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branding_assignments
    ADD CONSTRAINT branding_assignments_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5635 (class 2606 OID 94192)
-- Name: branding_assignments branding_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branding_assignments
    ADD CONSTRAINT branding_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5636 (class 2606 OID 94197)
-- Name: builder_approvals builder_approvals_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_approvals
    ADD CONSTRAINT builder_approvals_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5637 (class 2606 OID 94202)
-- Name: builder_attachments builder_attachments_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_attachments
    ADD CONSTRAINT builder_attachments_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.section_blocks(id) ON DELETE SET NULL;


--
-- TOC entry 5638 (class 2606 OID 94207)
-- Name: builder_attachments builder_attachments_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_attachments
    ADD CONSTRAINT builder_attachments_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5639 (class 2606 OID 94212)
-- Name: builder_attachments builder_attachments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_attachments
    ADD CONSTRAINT builder_attachments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE SET NULL;


--
-- TOC entry 5640 (class 2606 OID 94217)
-- Name: builder_attachments builder_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.builder_attachments
    ADD CONSTRAINT builder_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5641 (class 2606 OID 94222)
-- Name: compiled_reports compiled_reports_compiled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compiled_reports
    ADD CONSTRAINT compiled_reports_compiled_by_fkey FOREIGN KEY (compiled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5642 (class 2606 OID 94227)
-- Name: compiled_reports compiled_reports_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compiled_reports
    ADD CONSTRAINT compiled_reports_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5643 (class 2606 OID 94232)
-- Name: cycle_department_deadlines cycle_department_deadlines_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cycle_department_deadlines
    ADD CONSTRAINT cycle_department_deadlines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5644 (class 2606 OID 94237)
-- Name: cycle_department_deadlines cycle_department_deadlines_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cycle_department_deadlines
    ADD CONSTRAINT cycle_department_deadlines_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.reporting_cycles(id) ON DELETE CASCADE;


--
-- TOC entry 5645 (class 2606 OID 94242)
-- Name: cycle_department_deadlines cycle_department_deadlines_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cycle_department_deadlines
    ADD CONSTRAINT cycle_department_deadlines_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- TOC entry 5646 (class 2606 OID 94247)
-- Name: dashboard_kpi dashboard_kpi_kpi_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_kpi
    ADD CONSTRAINT dashboard_kpi_kpi_config_id_fkey FOREIGN KEY (kpi_config_id) REFERENCES public.kpi_config(id) ON DELETE CASCADE;


--
-- TOC entry 5647 (class 2606 OID 94252)
-- Name: data_sources data_sources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5648 (class 2606 OID 94257)
-- Name: data_sources data_sources_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE CASCADE;


--
-- TOC entry 5649 (class 2606 OID 94262)
-- Name: data_sources data_sources_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5650 (class 2606 OID 94267)
-- Name: department_form_deadline_config department_form_deadline_config_department_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_deadline_config
    ADD CONSTRAINT department_form_deadline_config_department_form_id_fkey FOREIGN KEY (department_form_id) REFERENCES public.department_table_list(id) ON DELETE CASCADE;


--
-- TOC entry 5651 (class 2606 OID 94272)
-- Name: department_form_lock_config department_form_lock_config_department_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_lock_config
    ADD CONSTRAINT department_form_lock_config_department_form_id_fkey FOREIGN KEY (department_form_id) REFERENCES public.department_table_list(id) ON DELETE CASCADE;


--
-- TOC entry 5652 (class 2606 OID 94277)
-- Name: department_form_roles department_form_roles_department_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_roles
    ADD CONSTRAINT department_form_roles_department_form_id_fkey FOREIGN KEY (department_form_id) REFERENCES public.department_table_list(id) ON DELETE CASCADE;


--
-- TOC entry 5653 (class 2606 OID 94282)
-- Name: department_form_year_mapping department_form_year_mapping_department_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_form_year_mapping
    ADD CONSTRAINT department_form_year_mapping_department_form_id_fkey FOREIGN KEY (department_form_id) REFERENCES public.department_table_list(id) ON DELETE CASCADE;


--
-- TOC entry 5654 (class 2606 OID 94287)
-- Name: departments departments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id);


--
-- TOC entry 5655 (class 2606 OID 94292)
-- Name: departments fk_departments_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5656 (class 2606 OID 94297)
-- Name: departments fk_departments_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 5658 (class 2606 OID 94302)
-- Name: institutions fk_institutions_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT fk_institutions_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5659 (class 2606 OID 94307)
-- Name: institutions fk_institutions_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT fk_institutions_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 5721 (class 2606 OID 94312)
-- Name: users fk_users_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5722 (class 2606 OID 94317)
-- Name: users fk_users_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- TOC entry 5723 (class 2606 OID 94322)
-- Name: users fk_users_institution; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id);


--
-- TOC entry 5657 (class 2606 OID 94327)
-- Name: form_lock_config form_lock_config_form_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_form_name_fkey FOREIGN KEY (form_name) REFERENCES public.table_list(form_name);


--
-- TOC entry 5660 (class 2606 OID 94332)
-- Name: kpi_svg_reports kpi_svg_reports_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_svg_reports
    ADD CONSTRAINT kpi_svg_reports_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.kpi_config(id) ON DELETE CASCADE;


--
-- TOC entry 5661 (class 2606 OID 94337)
-- Name: nodal_officer_assignments nodal_officer_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodal_officer_assignments
    ADD CONSTRAINT nodal_officer_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- TOC entry 5662 (class 2606 OID 94342)
-- Name: nodal_officer_assignments nodal_officer_assignments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodal_officer_assignments
    ADD CONSTRAINT nodal_officer_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- TOC entry 5663 (class 2606 OID 94347)
-- Name: nodal_officer_assignments nodal_officer_assignments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodal_officer_assignments
    ADD CONSTRAINT nodal_officer_assignments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id);


--
-- TOC entry 5664 (class 2606 OID 94352)
-- Name: nodal_officer_assignments nodal_officer_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodal_officer_assignments
    ADD CONSTRAINT nodal_officer_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5665 (class 2606 OID 94357)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5666 (class 2606 OID 94362)
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5667 (class 2606 OID 94367)
-- Name: report_access report_access_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_access
    ADD CONSTRAINT report_access_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5668 (class 2606 OID 94372)
-- Name: report_audit_log report_audit_log_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_audit_log
    ADD CONSTRAINT report_audit_log_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE SET NULL;


--
-- TOC entry 5669 (class 2606 OID 94377)
-- Name: report_audit_log report_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_audit_log
    ADD CONSTRAINT report_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5670 (class 2606 OID 94382)
-- Name: report_department_deadlines report_department_deadlines_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_department_deadlines
    ADD CONSTRAINT report_department_deadlines_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- TOC entry 5671 (class 2606 OID 94387)
-- Name: report_department_deadlines report_department_deadlines_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_department_deadlines
    ADD CONSTRAINT report_department_deadlines_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5672 (class 2606 OID 94392)
-- Name: report_sections report_sections_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- TOC entry 5673 (class 2606 OID 94397)
-- Name: report_sections report_sections_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;


--
-- TOC entry 5674 (class 2606 OID 94402)
-- Name: report_sections report_sections_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5675 (class 2606 OID 94407)
-- Name: report_sections report_sections_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5676 (class 2606 OID 94412)
-- Name: report_sections report_sections_source_template_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_source_template_section_id_fkey FOREIGN KEY (source_template_section_id) REFERENCES public.template_sections(id) ON DELETE SET NULL;


--
-- TOC entry 5677 (class 2606 OID 94417)
-- Name: report_sections report_sections_workflow_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_sections
    ADD CONSTRAINT report_sections_workflow_template_id_fkey FOREIGN KEY (workflow_template_id) REFERENCES public.workflow_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5678 (class 2606 OID 94422)
-- Name: report_templates report_templates_default_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_default_workflow_id_fkey FOREIGN KEY (default_workflow_id) REFERENCES public.workflow_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5679 (class 2606 OID 94427)
-- Name: report_templates report_templates_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE CASCADE;


--
-- TOC entry 5680 (class 2606 OID 94432)
-- Name: reporting_cycles reporting_cycles_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reporting_cycles
    ADD CONSTRAINT reporting_cycles_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE CASCADE;


--
-- TOC entry 5681 (class 2606 OID 94437)
-- Name: reports reports_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.reporting_cycles(id) ON DELETE SET NULL;


--
-- TOC entry 5682 (class 2606 OID 94442)
-- Name: reports reports_default_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_default_workflow_id_fkey FOREIGN KEY (default_workflow_id) REFERENCES public.workflow_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5683 (class 2606 OID 94447)
-- Name: reports reports_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE CASCADE;


--
-- TOC entry 5684 (class 2606 OID 94452)
-- Name: reports reports_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5685 (class 2606 OID 94457)
-- Name: reports reports_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.report_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5686 (class 2606 OID 94462)
-- Name: section_access section_access_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_access
    ADD CONSTRAINT section_access_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- TOC entry 5687 (class 2606 OID 94467)
-- Name: section_access section_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_access
    ADD CONSTRAINT section_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5688 (class 2606 OID 94472)
-- Name: section_access section_access_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_access
    ADD CONSTRAINT section_access_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5689 (class 2606 OID 94477)
-- Name: section_access section_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_access
    ADD CONSTRAINT section_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5690 (class 2606 OID 94482)
-- Name: section_assignments section_assignments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_assignments
    ADD CONSTRAINT section_assignments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5691 (class 2606 OID 94487)
-- Name: section_blocks section_blocks_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_blocks
    ADD CONSTRAINT section_blocks_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;


--
-- TOC entry 5692 (class 2606 OID 94492)
-- Name: section_blocks section_blocks_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_blocks
    ADD CONSTRAINT section_blocks_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5693 (class 2606 OID 94497)
-- Name: section_blocks section_blocks_source_template_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_blocks
    ADD CONSTRAINT section_blocks_source_template_block_id_fkey FOREIGN KEY (source_template_block_id) REFERENCES public.template_blocks(id) ON DELETE SET NULL;


--
-- TOC entry 5694 (class 2606 OID 94502)
-- Name: section_department_assignments section_department_assignments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_department_assignments
    ADD CONSTRAINT section_department_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- TOC entry 5695 (class 2606 OID 94507)
-- Name: section_department_assignments section_department_assignments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_department_assignments
    ADD CONSTRAINT section_department_assignments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5696 (class 2606 OID 94512)
-- Name: section_signoffs section_signoffs_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_signoffs
    ADD CONSTRAINT section_signoffs_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5697 (class 2606 OID 94517)
-- Name: section_signoffs section_signoffs_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_signoffs
    ADD CONSTRAINT section_signoffs_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5698 (class 2606 OID 94522)
-- Name: section_signoffs section_signoffs_workflow_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_signoffs
    ADD CONSTRAINT section_signoffs_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;


--
-- TOC entry 5699 (class 2606 OID 94527)
-- Name: section_translations section_translations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_translations
    ADD CONSTRAINT section_translations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5700 (class 2606 OID 94532)
-- Name: section_translations section_translations_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_translations
    ADD CONSTRAINT section_translations_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5701 (class 2606 OID 94537)
-- Name: section_translations section_translations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_translations
    ADD CONSTRAINT section_translations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5702 (class 2606 OID 94542)
-- Name: section_versions section_versions_latest_decision_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_versions
    ADD CONSTRAINT section_versions_latest_decision_step_id_fkey FOREIGN KEY (latest_decision_step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- TOC entry 5703 (class 2606 OID 94547)
-- Name: section_versions section_versions_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_versions
    ADD CONSTRAINT section_versions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id);


--
-- TOC entry 5704 (class 2606 OID 94552)
-- Name: section_versions section_versions_workflow_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_versions
    ADD CONSTRAINT section_versions_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- TOC entry 5705 (class 2606 OID 94557)
-- Name: section_workflow_assignments section_workflow_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5706 (class 2606 OID 94562)
-- Name: section_workflow_assignments section_workflow_assignments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- TOC entry 5707 (class 2606 OID 94567)
-- Name: section_workflow_assignments section_workflow_assignments_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- TOC entry 5708 (class 2606 OID 94572)
-- Name: section_workflow_assignments section_workflow_assignments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.report_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5709 (class 2606 OID 94577)
-- Name: section_workflow_assignments section_workflow_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5710 (class 2606 OID 94582)
-- Name: section_workflow_assignments section_workflow_assignments_workflow_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.section_workflow_assignments
    ADD CONSTRAINT section_workflow_assignments_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;


--
-- TOC entry 5711 (class 2606 OID 94587)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5712 (class 2606 OID 94592)
-- Name: template_blocks template_blocks_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_blocks
    ADD CONSTRAINT template_blocks_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;


--
-- TOC entry 5713 (class 2606 OID 94597)
-- Name: template_blocks template_blocks_template_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_blocks
    ADD CONSTRAINT template_blocks_template_section_id_fkey FOREIGN KEY (template_section_id) REFERENCES public.template_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5714 (class 2606 OID 94602)
-- Name: template_sections template_sections_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.data_sources(id) ON DELETE SET NULL;


--
-- TOC entry 5715 (class 2606 OID 94607)
-- Name: template_sections template_sections_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.template_sections(id) ON DELETE CASCADE;


--
-- TOC entry 5716 (class 2606 OID 94612)
-- Name: template_sections template_sections_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.report_templates(id) ON DELETE CASCADE;


--
-- TOC entry 5717 (class 2606 OID 94617)
-- Name: template_sections template_sections_workflow_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_workflow_template_id_fkey FOREIGN KEY (workflow_template_id) REFERENCES public.workflow_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5718 (class 2606 OID 94622)
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- TOC entry 5719 (class 2606 OID 94627)
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- TOC entry 5720 (class 2606 OID 94632)
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5724 (class 2606 OID 94637)
-- Name: workflow_steps workflow_steps_approver_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_approver_department_id_fkey FOREIGN KEY (approver_department_id) REFERENCES public.departments(department_id) ON DELETE SET NULL;


--
-- TOC entry 5725 (class 2606 OID 94642)
-- Name: workflow_steps workflow_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workflow_templates(id) ON DELETE CASCADE;


--
-- TOC entry 5726 (class 2606 OID 94647)
-- Name: workflow_templates workflow_templates_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id) ON DELETE CASCADE;


-- Completed on 2026-06-24 20:31:03

--
-- PostgreSQL database dump complete
--

\unrestrict RXXZsfMMeACazKVAvdJ2wEAh89bjlSLaT0uWilpYi7hMruEUjXjR94iW9Gz87KM

