--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2026-05-21 22:19:35

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
-- TOC entry 2 (class 3079 OID 145000)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5231 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 908 (class 1247 OID 145038)
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
-- TOC entry 911 (class 1247 OID 145050)
-- Name: department_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.department_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public.department_status OWNER TO postgres;

--
-- TOC entry 914 (class 1247 OID 145056)
-- Name: institution_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.institution_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public.institution_status OWNER TO postgres;

--
-- TOC entry 917 (class 1247 OID 145062)
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
-- TOC entry 920 (class 1247 OID 145076)
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
-- TOC entry 279 (class 1255 OID 145085)
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
-- TOC entry 242 (class 1259 OID 153667)
-- Name: abcdef_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abcdef_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    abcdef text,
    doc text,
    vv text
);


ALTER TABLE public.abcdef_records OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 145086)
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
-- TOC entry 236 (class 1259 OID 145381)
-- Name: custom_field_schemas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_field_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text NOT NULL,
    institution_id uuid NOT NULL,
    year integer NOT NULL,
    schema jsonb NOT NULL,
    is_active boolean DEFAULT true,
    used_column_names text[] DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid
);


ALTER TABLE public.custom_field_schemas OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 145094)
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
    updated_by uuid
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 145437)
-- Name: erfa_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.erfa_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sada text
);


ALTER TABLE public.erfa_records OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 145363)
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
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.form_lock_config OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 145427)
-- Name: heheh2_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.heheh2_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    testing text
);


ALTER TABLE public.heheh2_records OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 145417)
-- Name: heheh_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.heheh_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    testing text
);


ALTER TABLE public.heheh_records OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 145103)
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
    updated_by uuid
);


ALTER TABLE public.institutions OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 145113)
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
-- TOC entry 222 (class 1259 OID 145123)
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
-- TOC entry 223 (class 1259 OID 145124)
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
-- TOC entry 5232 (class 0 OID 0)
-- Dependencies: 223
-- Name: management_committees_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.management_committees_id_seq1 OWNED BY public.management_committees.id;


--
-- TOC entry 224 (class 1259 OID 145125)
-- Name: medical_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.medical_reports (
    period text NOT NULL,
    x_ray integer,
    usg integer,
    bmd integer,
    ct_scan integer
);


ALTER TABLE public.medical_reports OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 145130)
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
-- TOC entry 226 (class 1259 OID 145143)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    event_id character varying(64) NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 145150)
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
-- TOC entry 5233 (class 0 OID 0)
-- Dependencies: 227
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- TOC entry 228 (class 1259 OID 145151)
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
-- TOC entry 229 (class 1259 OID 145161)
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
-- TOC entry 230 (class 1259 OID 145169)
-- Name: svg_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.svg_reports (
    id integer NOT NULL,
    title text DEFAULT 'Radiology Report'::text NOT NULL,
    description text DEFAULT ''::text,
    svg_data text NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    chart_type character varying(50) DEFAULT 'bar'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    report_data jsonb,
    CONSTRAINT svg_reports_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('approval'::character varying)::text, ('final'::character varying)::text])))
);


ALTER TABLE public.svg_reports OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 145181)
-- Name: svg_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.svg_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.svg_reports_id_seq OWNER TO postgres;

--
-- TOC entry 5234 (class 0 OID 0)
-- Dependencies: 231
-- Name: svg_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.svg_reports_id_seq OWNED BY public.svg_reports.id;


--
-- TOC entry 234 (class 1259 OID 145351)
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
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.table_list OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 145447)
-- Name: teseter2_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teseter2_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    a text,
    h text,
    bb text,
    fss text
);


ALTER TABLE public.teseter2_records OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 145407)
-- Name: tester_rohit_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tester_rohit_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_name text,
    institution_id uuid,
    year integer,
    schema_id uuid,
    status text,
    order_index integer,
    custom_fields jsonb,
    language text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    helloman text,
    java text
);


ALTER TABLE public.tester_rohit_records OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 145182)
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
-- TOC entry 233 (class 1259 OID 145187)
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
    is_temporary_password boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 4889 (class 2604 OID 145198)
-- Name: management_committees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.management_committees ALTER COLUMN id SET DEFAULT nextval('public.management_committees_id_seq1'::regclass);


--
-- TOC entry 4902 (class 2604 OID 145199)
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- TOC entry 4913 (class 2604 OID 145200)
-- Name: svg_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.svg_reports ALTER COLUMN id SET DEFAULT nextval('public.svg_reports_id_seq'::regclass);


--
-- TOC entry 5225 (class 0 OID 153667)
-- Dependencies: 242
-- Data for Name: abcdef_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.abcdef_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, abcdef, doc, vv) FROM stdin;
65394889-31e9-414f-86ce-e221d15451ed	abcdef	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	c924ab05-1a96-4782-8413-654cf1ca3eb5	\N	\N	\N	en	2026-05-20 23:07:29.171636+05:30	2026-05-20 23:10:05.431268+05:30	rewre	http://localhost:5000/uploads/documents/b0445d87-bad0-4f87-9045-27da889871b6.pdf	ji
\.


--
-- TOC entry 5201 (class 0 OID 145086)
-- Dependencies: 218
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action_type, entity_type, entity_id, old_value, new_value, changed_fields, status, message, ip_address, user_agent, metadata, created_at, browser_name, session_id) FROM stdin;
5c2ad157-7486-45d5-ace5-3fffb147c541	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	a22575fd-14f9-4b60-ab59-11ee5a524dd8	{"code": "P001", "name": "Panchakarma Department", "status": "ACTIVE"}	{"code": "P0001", "name": "Panchakarma", "status": "ACTIVE"}	{name,code}	SUCCESS	Department "Panchakarma" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-26 20:17:46.442566+05:30	\N	\N
65cdfe9a-ae0b-4bf0-9ba5-c903091bea58	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	a22575fd-14f9-4b60-ab59-11ee5a524dd8	{"code": "P0001", "name": "Panchakarma", "status": "ACTIVE"}	{"code": "P001", "name": "Panchakarma Dept", "status": "ACTIVE"}	{name,code}	SUCCESS	Department "Panchakarma Dept" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-26 20:18:14.44265+05:30	\N	\N
8abc832d-9ea4-4b7b-9052-732bd4e9ac5e	99b9192d-1342-4883-b9a7-5fb701da5180	INST_UPDATED	INSTITUTION	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	{"city": "Delhi", "code": "002", "name": "AIIA", "state": "Delhi", "status": "ACTIVE", "pincode": "110001", "email_domain": "aiiadelhi.edu.in"}	{"city": "Delhi", "code": "002", "name": "AIIA", "state": "Delhi", "status": "ACTIVE", "pincode": "110001", "email_domain": "aiiaayush.edu.in"}	{email_domain}	SUCCESS	Institution "AIIA" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-26 20:42:43.068307+05:30	\N	\N
3f2be73b-ed6f-4fbf-8153-21661680eb1a	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	d6d4a853-ec3f-4c28-ad42-0a585783475c	{"email": "arun@gmail.com", "full_name": "Arun", "department_id": null, "account_status": "ACTIVE", "institution_id": null}	{"email": "arun@gmail.com", "full_name": "Arun", "department_id": null, "account_status": "INACTIVE", "institution_id": null}	{account_status}	SUCCESS	User "Arun" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-26 22:57:50.328875+05:30	\N	\N
6ac5ae3b-fcc0-4387-a993-8b0b952aa4b4	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_CREATED	DEPARTMENT	2c123037-ba6a-4922-8786-2c51a647ac90	\N	{"code": "K001", "name": "Kayachikitsa", "status": "ACTIVE"}	\N	SUCCESS	Department "Kayachikitsa" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-27 21:22:30.790538+05:30	\N	\N
28339e1a-5c6e-4525-9af9-aad2a59f0221	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	c3dbd707-7286-4863-870b-f55195f9c70f	{"publications": ["create"]}	{"assign_roles_institute": true}	{publications,assign_roles_institute}	SUCCESS	Role "Contributor" permissions updated — 2 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["assign_roles_institute"], "revoked": ["publications"], "role_name": "contributor"}	2026-04-27 23:52:41.972424+05:30	\N	\N
cee837de-6b69-4b85-b8be-27c10558c66d	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	2c123037-ba6a-4922-8786-2c51a647ac90	{"code": "K001", "name": "Kayachikitsa", "status": "ACTIVE"}	{"code": "K001", "name": "Kayachikitsa", "status": "INACTIVE"}	{status}	SUCCESS	Department "Kayachikitsa" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-29 23:12:06.57854+05:30	Chrome	\N
063c42e6-8961-4986-a78f-8992fc6b5c1c	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	a22575fd-14f9-4b60-ab59-11ee5a524dd8	{"code": "P001", "name": "Panchakarma Dept", "status": "ACTIVE"}	{"code": "P001", "name": "Panchakarma Dept", "status": "INACTIVE"}	{status}	SUCCESS	Department "Panchakarma Dept" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-29 23:19:54.180231+05:30	Chrome	\N
0dd41eb7-e3d2-4edc-a242-01e3a276a8cb	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	2c123037-ba6a-4922-8786-2c51a647ac90	{"code": "K001", "name": "Kayachikitsa", "status": "INACTIVE"}	{"code": "K001", "name": "Kayachikitsa", "status": "ACTIVE"}	{status}	SUCCESS	Department "Kayachikitsa" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-04-29 23:29:58.224528+05:30	Chrome	\N
d7429ede-ef47-49cf-941f-99346089e918	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	ad27f00a-381b-4f0a-b692-ede154d6bcbb	\N	{"role": "head_of_department", "email": "moulinisrinivasan@gmail.com", "full_name": "MOULINI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "MOULINI" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:18:59.860794+05:30	Chrome	\N
042ccea0-6838-445f-b54b-8c1f2eca5422	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	c5e767bb-a178-4c02-ab4e-e83477e001ab	\N	{"role": "head_of_department", "email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:22:16.836545+05:30	Chrome	\N
2b502770-7309-45ce-8e1c-dc4cda18600c	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	c5e767bb-a178-4c02-ab4e-e83477e001ab	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "INACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{account_status}	SUCCESS	User "Moulini" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:25:14.340674+05:30	Chrome	\N
d49c30a9-06fa-4ed3-8f66-1b455d82c1f5	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	ad27f00a-381b-4f0a-b692-ede154d6bcbb	{"email": "moulinisrinivasan@gmail.com", "full_name": "MOULINI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "MOULINI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "MOULINI" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:25:16.003392+05:30	Chrome	\N
429e9758-3d20-4ff2-b08c-ea311fd420e6	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	5adf6768-0e96-4c59-96fe-e48bb3c1119c	\N	{"role": "head_of_department", "email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:25:30.567254+05:30	Chrome	\N
4c442183-12f2-4d90-bf73-9751f1bf1e63	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	5adf6768-0e96-4c59-96fe-e48bb3c1119c	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "Moulini" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:28:23.772404+05:30	Chrome	\N
1e26acd3-aa80-4576-ac8d-f13c16227c15	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	c489ae7f-cc38-4429-aec4-e3c70d1d92c4	\N	{"role": "department_admin", "email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Mouli" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:28:50.886418+05:30	Chrome	\N
e32190d1-dd11-4105-b129-9694c2a45833	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	c489ae7f-cc38-4429-aec4-e3c70d1d92c4	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "Mouli" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:31:34.237258+05:30	Chrome	\N
f798d4e1-51c6-4970-a327-2a71f4b11856	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	184db862-3d1e-43da-81bf-1df131df37db	\N	{"role": "department_admin", "email": "moulinisrinivasan@gmail.com", "full_name": "MOULI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "MOULI" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:31:50.43546+05:30	Chrome	\N
4a6779db-0528-4a28-8a60-0f137326c5a7	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	184db862-3d1e-43da-81bf-1df131df37db	{"email": "moulinisrinivasan@gmail.com", "full_name": "MOULI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "MOULI", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "MOULI" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:33:40.436826+05:30	Chrome	\N
6e8227a9-87a5-4493-bd8f-c37c883b8c42	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	fae51eea-52d9-46f8-a5cb-cda9ed22f929	\N	{"role": "head_of_department", "email": "moulinisrinivasan@gmail.com", "full_name": "Moul", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Moul" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:33:59.049845+05:30	Chrome	\N
b1012582-52b9-47a6-8804-dc8c77521150	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	fae51eea-52d9-46f8-a5cb-cda9ed22f929	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moul", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moul", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "INACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{account_status}	SUCCESS	User "Moul" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:35:16.754104+05:30	Chrome	\N
d49b8902-8821-427d-90ed-88d0eb7d722c	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	9b62012a-48ef-463b-be4e-f8acb713d947	\N	{"role": "nodal_officer", "email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Mouli" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:35:33.955848+05:30	Chrome	\N
6c7fc212-780f-4b0c-aeb0-ffb99b307cc2	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	9b62012a-48ef-463b-be4e-f8acb713d947	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "INACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{account_status}	SUCCESS	User "Mouli" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:36:03.384198+05:30	Chrome	\N
cb420f22-9ec7-49ae-83bd-7108e5ae0bd1	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	620a6b43-3cc4-4621-aa80-de2aa7664f4b	\N	{"role": "directors_office", "email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000001", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Mouli" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 00:36:17.035984+05:30	Chrome	\N
1107e648-ef8f-4ce4-bd2a-dec33f6016ee	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	620a6b43-3cc4-4621-aa80-de2aa7664f4b	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000001", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Mouli", "department_id": "bbbbbbbb-0000-0000-0000-000000000001", "account_status": "INACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{account_status}	SUCCESS	User "Mouli" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 14:59:20.21542+05:30	Chrome	\N
bd303633-7c41-492f-8b9d-79b43e7e13b9	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	82966c60-45c5-46f2-b5b0-e7bfaafaf646	\N	{"role": "head_of_department", "email": "moulinisrinivasan@gmail.com", "full_name": "Moullllllllllll", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Moullllllllllll" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 14:59:45.784988+05:30	Chrome	\N
ff935b38-895b-42e7-b222-728ee67f744e	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	614e911a-5d01-49cb-9929-3fb2fca0cf1e	\N	{"role": "institute_admin", "email": "pmdevelopers01@gmail.com", "full_name": "PM", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "PM" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:19:28.372159+05:30	Chrome	\N
9d8149d4-02de-4f23-972a-6dfc43da7784	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	614e911a-5d01-49cb-9929-3fb2fca0cf1e	{"email": "pmdevelopers01@gmail.com", "full_name": "PM", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "pmdevelopers01@gmail.com", "full_name": "PM", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "PM" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:23:40.77964+05:30	Chrome	\N
6b5050ca-8bff-4d45-84cb-f8cd3cd78d04	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	50dbb616-1e15-4ad0-b9db-10d84d58be01	\N	{"role": "directors_office", "email": "pmdevelopers01@gmail.com", "full_name": "Pm dev", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "Pm dev" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:24:04.266793+05:30	Chrome	\N
0d57d582-702d-4dad-b191-97fec631204c	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	50dbb616-1e15-4ad0-b9db-10d84d58be01	{"email": "pmdevelopers01@gmail.com", "full_name": "Pm dev", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "pmdevelopers01@gmail.com", "full_name": "Pm dev", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "INACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{account_status}	SUCCESS	User "Pm dev" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:31:15.616288+05:30	Chrome	\N
e84bcbf6-5104-477a-afe3-02f0c4fc8706	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	2e80cf8a-5a22-4b41-a67d-779e43665a45	\N	{"role": "publication_cell", "email": "pmdevelopers01@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:31:35.235013+05:30	Chrome	\N
d33860c3-b28c-4eae-b226-e4084d02a5bd	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	2e80cf8a-5a22-4b41-a67d-779e43665a45	{"email": "pmdevelopers01@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "pmdevelopers01@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "Moulini" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:33:30.547715+05:30	Chrome	\N
ed72d624-d272-4e1a-a5f4-f11a7caaf4d8	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	cd8a8314-07ef-40cb-bb5c-62471a1d93b1	\N	{"role": "institute_admin", "email": "pmdevelopers01@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 15:33:43.754733+05:30	Chrome	\N
3f3e9e74-4904-43e5-9f7a-3295e8107fd4	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	f925686f-e962-47e6-8ac7-33bc05ba7e3f	\N	{"role": "publication_cell", "email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 19:50:08.794604+05:30	Chrome	\N
a039ea56-262c-4423-aa8e-7127351dfc01	99b9192d-1342-4883-b9a7-5fb701da5180	USER_CREATED	USER	89f764b2-568e-490a-932b-f80da9a89530	\N	{"role": "institute_admin", "email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "Moulini" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 20:13:24.515127+05:30	Chrome	\N
84a3304d-8290-42d6-ac4a-a9a255f3ea32	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	89f764b2-568e-490a-932b-f80da9a89530	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "Moulini" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 20:21:12.662388+05:30	Chrome	\N
39a72f82-6abf-47e2-813a-b1b38e6ee5c1	99b9192d-1342-4883-b9a7-5fb701da5180	USER_UPDATED	USER	89f764b2-568e-490a-932b-f80da9a89530	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "INACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "moulinisrinivasan@gmail.com", "full_name": "Moulini", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{account_status}	SUCCESS	User "Moulini" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 20:21:26.153594+05:30	Chrome	\N
ba597683-9363-408b-8980-26b32b65c962	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_CREATED	DEPARTMENT	37ee9bdd-334b-4bc7-a6a5-0f7d468c9f28	\N	{"code": "D001", "name": "Dravyaguna", "status": "ACTIVE"}	\N	SUCCESS	Department "Dravyaguna" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 23:54:53.241193+05:30	Chrome	\N
2047f676-cf40-4616-a11a-4833b785f48b	99b9192d-1342-4883-b9a7-5fb701da5180	DEPT_UPDATED	DEPARTMENT	37ee9bdd-334b-4bc7-a6a5-0f7d468c9f28	{"code": "D001", "name": "Dravyaguna", "status": "ACTIVE"}	{"code": "D001", "name": "Dravyaguna", "status": "INACTIVE"}	{status}	SUCCESS	Department "Dravyaguna" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-02 23:56:53.419254+05:30	Chrome	\N
40df05eb-c570-4a40-96b1-62db5009c2f9	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	ca2aee76-a1ee-487f-a8df-de0690a34e01	{"finance": ["read", "write"]}	{"fill_finance_forms": true}	{finance,fill_finance_forms}	SUCCESS	Role "Finance Officer/s" permissions updated — 2 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["fill_finance_forms"], "revoked": ["finance"], "role_name": "finance_officer"}	2026-05-02 23:59:25.963855+05:30	Chrome	\N
b4c9cc9a-4bb0-4a8f-b03a-0a30f8949024	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	ca2aee76-a1ee-487f-a8df-de0690a34e01	{"upload_statements": false}	{"upload_statements": true}	{upload_statements}	SUCCESS	Role "Finance Officer/s" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["upload_statements"], "revoked": [], "role_name": "finance_officer"}	2026-05-03 12:04:57.775292+05:30	Chrome	\N
38e81757-629d-4e24-928a-41b844be6ce9	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"institution": ["read", "write"]}	{"fill_dept_forms": true}	{institution,fill_dept_forms}	SUCCESS	Role "Institute Admin" permissions updated — 2 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["fill_dept_forms"], "revoked": ["institution"], "role_name": "institute_admin"}	2026-05-03 12:05:26.159007+05:30	Chrome	\N
5a9cdf87-0cc4-4f58-b18e-d3df07ec89ba	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_institute_forms": false}	{"fill_institute_forms": true}	{fill_institute_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["fill_institute_forms"], "revoked": [], "role_name": "institute_admin"}	2026-05-03 21:37:31.542379+05:30	Chrome	\N
2a36b46a-559a-4666-917b-af021cbfcd7b	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_dept_forms": true}	{"fill_dept_forms": false}	{fill_dept_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": [], "revoked": ["fill_dept_forms"], "role_name": "institute_admin"}	2026-05-03 21:43:11.568496+05:30	Chrome	\N
a02bfaf1-5f52-4a5a-bb00-c0b34d0b4f53	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_dept_forms": false}	{"fill_dept_forms": true}	{fill_dept_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["fill_dept_forms"], "revoked": [], "role_name": "institute_admin"}	2026-05-03 21:45:17.197701+05:30	Chrome	\N
2105a35a-8225-488a-8f56-671a2238c25f	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	bd86bc4f-e04e-456a-9370-683e34521671	{"department": ["read"]}	{"manage_departments": true}	{department,manage_departments}	SUCCESS	Role "Head of Department" permissions updated — 2 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["manage_departments"], "revoked": ["department"], "role_name": "head_of_department"}	2026-05-03 21:45:24.847644+05:30	Chrome	\N
ab35eb3f-75a1-4a11-9b08-bbe7f97040b0	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_institute_forms": true}	{"fill_institute_forms": false}	{fill_institute_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": [], "revoked": ["fill_institute_forms"], "role_name": "institute_admin"}	2026-05-03 21:48:11.646655+05:30	Chrome	\N
26c9f7aa-f9e8-4103-b8ec-a4de48d695e2	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_institute_forms": false}	{"fill_institute_forms": true}	{fill_institute_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["fill_institute_forms"], "revoked": [], "role_name": "institute_admin"}	2026-05-03 22:06:33.516051+05:30	Chrome	\N
00fa6901-3292-4748-9ac5-07128db4a755	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	eb21df23-350b-449d-bec8-37395c85107e	{"fill_dept_forms": true}	{"fill_dept_forms": false}	{fill_dept_forms}	SUCCESS	Role "Institute Admin" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": [], "revoked": ["fill_dept_forms"], "role_name": "institute_admin"}	2026-05-03 22:08:50.49971+05:30	Chrome	\N
8efbecde-ac4e-4e83-82ed-fd3c67bf718f	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	ca2aee76-a1ee-487f-a8df-de0690a34e01	{"audit_logs": false}	{"audit_logs": true}	{audit_logs}	SUCCESS	Role "Finance Officer/s" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": ["audit_logs"], "revoked": [], "role_name": "finance_officer"}	2026-05-03 22:10:01.888842+05:30	Chrome	\N
5375a3b3-4aba-4235-8a0f-248a20bb0319	99b9192d-1342-4883-b9a7-5fb701da5180	ROLE_PERMISSIONS_CHANGED	ROLE	ca2aee76-a1ee-487f-a8df-de0690a34e01	{"audit_logs": true}	{"audit_logs": false}	{audit_logs}	SUCCESS	Role "Finance Officer/s" permissions updated — 1 permission(s) changed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	{"granted": [], "revoked": ["audit_logs"], "role_name": "finance_officer"}	2026-05-03 22:10:09.153981+05:30	Chrome	\N
149bd13d-f204-42d4-a2cc-e3fcdb43ef72	99b9192d-1342-4883-b9a7-5fb701da5180	USERS_BULK_IMPORTED	USER	\N	\N	{"total": 4, "failed": 0, "skipped": 0, "imported": 4}	\N	SUCCESS	Bulk import: 4 created/updated, 0 skipped, 0 failed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-05 22:07:10.477572+05:30	Chrome	\N
f2cc8b93-587e-4635-ab18-3d870ae1cb11	99b9192d-1342-4883-b9a7-5fb701da5180	USERS_BULK_IMPORTED	USER	\N	\N	{"total": 4, "failed": 0, "skipped": 4, "imported": 0}	\N	SUCCESS	Bulk import: 0 created/updated, 4 skipped, 0 failed	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-05 22:08:09.364185+05:30	Chrome	\N
154a5985-2884-4e29-bad6-efed261605a6	cccccccc-0000-0000-0000-000000000001	USER_CREATED	USER	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	{"role": "institute_admin", "email": "iadmin@aiia.edu.in", "full_name": "iAdmin1", "department_id": null, "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "iAdmin1" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-06 23:12:05.633434+05:30	Chrome	\N
8f5eb5f0-6bd9-4740-bed2-bb0d10af7510	1503c19f-8972-40b5-aa27-877daf8d82e0	CREATE_FORM	FORM	aa38a9c1-be05-4657-807e-b358d2262ee3	\N	{"form_name": "heheh2", "share_table": false, "records_table": "heheh2_records", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-07 23:12:38.366841+05:30	Chrome	\N
012b8978-6baf-44b7-b552-0c9969e54f13	cccccccc-0000-0000-0000-000000000001	USER_CREATED	USER	20facbff-eae7-4a80-9ee4-1311bab2b2da	\N	{"role": "department_admin", "email": "dadmin@aiia.edu.in", "full_name": "dAdmin", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	User "dAdmin" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-07 23:22:22.566842+05:30	Chrome	\N
4569f83b-f49e-4fd3-8670-966cc334b6ec	1503c19f-8972-40b5-aa27-877daf8d82e0	CREATE_FORM	FORM	5e7d89bd-437c-4fd3-8308-60afe4aecb98	\N	{"form_name": "erfa", "share_table": false, "records_table": "erfa_records", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-07 23:39:57.398868+05:30	Chrome	\N
e36133bc-3ffd-4c1b-9678-f8a115e7c2f3	cccccccc-0000-0000-0000-000000000001	USER_CREATED	USER	24841969-f268-4e31-b939-7e1ce508c627	\N	{"role": "institute_admin", "email": "iadmin@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	User "admin2" created	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 22:43:28.445395+05:30	Chrome	\N
c112f7a1-39f1-4974-afb3-8c58d7ce66c3	24841969-f268-4e31-b939-7e1ce508c627	CREATE_FORM	FORM	0e511ffc-ffb8-41ea-9a28-b9ef2512ff19	\N	{"form_name": "teseter2", "share_table": false, "records_table": "teseter2_records", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	\N	SUCCESS	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 22:46:05.774577+05:30	Chrome	\N
329255a0-3f96-410a-a1cc-d08c7967200b	cccccccc-0000-0000-0000-000000000001	USER_UPDATED	USER	20facbff-eae7-4a80-9ee4-1311bab2b2da	{"email": "dadmin@aiia.edu.in", "full_name": "dAdmin", "department_id": "2c123037-ba6a-4922-8786-2c51a647ac90", "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{"email": "dadmin@aiia.edu.in", "full_name": "dAdmin", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{institution_id,department_id}	SUCCESS	User "dAdmin" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 23:44:16.776642+05:30	Chrome	\N
f8388d92-6a2c-4f30-88b4-6d34660842a0	cccccccc-0000-0000-0000-000000000001	USER_UPDATED	USER	24841969-f268-4e31-b939-7e1ce508c627	{"email": "iadmin@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "iadmin2@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{email}	SUCCESS	User "admin2" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 23:50:17.762005+05:30	Chrome	\N
b8a1e971-f45b-4232-a637-16133e777332	cccccccc-0000-0000-0000-000000000001	USER_UPDATED	USER	24841969-f268-4e31-b939-7e1ce508c627	{"email": "iadmin2@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "iadmin@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{email}	SUCCESS	User "admin2" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 23:53:42.943931+05:30	Chrome	\N
b447986a-4bbe-494c-a338-4c37557491ae	cccccccc-0000-0000-0000-000000000001	USER_UPDATED	USER	24841969-f268-4e31-b939-7e1ce508c627	{"email": "iadmin@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "iadmin2@aiia.edu.in", "full_name": "admin2", "department_id": null, "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{email}	SUCCESS	User "admin2" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	\N	2026-05-13 23:53:49.519477+05:30	Chrome	\N
f1d3fc32-84a7-4f7b-ac9d-635ef84c7c71	1503c19f-8972-40b5-aa27-877daf8d82e0	CREATE_FORM	FORM	c924ab05-1a96-4782-8413-654cf1ca3eb5	\N	{"form_name": "abcdef", "share_table": true, "records_table": "abcdef_records", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	\N	SUCCESS	\N	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	\N	2026-05-20 23:05:22.183352+05:30	Chrome	\N
767edf75-bd2c-4d67-a1ab-a3c64842e15d	cccccccc-0000-0000-0000-000000000001	USER_UPDATED	USER	20facbff-eae7-4a80-9ee4-1311bab2b2da	{"email": "dadmin@aiia.edu.in", "full_name": "dAdmin", "department_id": "bbbbbbbb-0000-0000-0000-000000000002", "account_status": "ACTIVE", "institution_id": "aaaaaaaa-0000-0000-0000-000000000001"}	{"email": "dadmin@aiia.edu.in", "full_name": "dAdmin", "department_id": null, "account_status": "ACTIVE", "institution_id": "9e2eb6f7-aa57-4262-bb28-a526c7e0511b"}	{institution_id,department_id}	SUCCESS	User "dAdmin" updated	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0	\N	2026-05-20 23:06:53.419443+05:30	Microsoft Edge	\N
\.


--
-- TOC entry 5219 (class 0 OID 145381)
-- Dependencies: 236
-- Data for Name: custom_field_schemas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_field_schemas (id, form_name, institution_id, year, schema_version, schema, is_active, created_at, created_by) FROM stdin;
2c0128c8-6212-4ad9-800f-a3aa26c8795d	tester_rohit	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	1	{"fields": [{"type": "text", "label": {"en": "hj", "hi": "nm.n", "ta": "kjk"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "helloman"}, {"type": "document", "label": {"en": "bmmb", "hi": "bmn", "ta": "mbmb"}, "order": 1, "options": [], "is_fixed": false, "required": true, "column_name": "java"}], "description": "Testing data", "display_label": "tester Rohit", "excluded_fixed_columns": []}	t	2026-05-07 23:07:47.945685+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
71684153-dd65-4667-925c-5a471b10c936	heheh	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	1	{"fields": [{"type": "text", "label": {"en": "srk;", "hi": "dyk;k", "ta": "hdkyt;k"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "testing"}], "description": "testing da", "display_label": "heheh", "excluded_fixed_columns": []}	t	2026-05-07 23:09:47.116984+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
aa38a9c1-be05-4657-807e-b358d2262ee3	heheh2	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	1	{"fields": [{"type": "text", "label": {"en": "srk;", "hi": "dyk;k", "ta": "hdkyt;k"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "testing"}], "description": "testing da", "display_label": "heheh2", "excluded_fixed_columns": []}	t	2026-05-07 23:12:38.192666+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
5e7d89bd-437c-4fd3-8308-60afe4aecb98	erfa	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	1	{"fields": [{"type": "textarea", "label": {"en": "dfsf", "hi": "sdfsd", "ta": "sdfsd"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "sada"}], "description": "sefsr", "display_label": "erfa", "excluded_fixed_columns": []}	t	2026-05-07 23:39:57.255831+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
0e511ffc-ffb8-41ea-9a28-b9ef2512ff19	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	1	{"fields": [{"type": "text", "label": {"en": "a", "hi": "a", "ta": "a"}, "order": 0, "options": [], "is_fixed": false, "required": false, "column_name": "a"}], "description": "sgs", "display_label": "teseter2", "excluded_fixed_columns": []}	f	2026-05-13 22:46:05.601119+05:30	24841969-f268-4e31-b939-7e1ce508c627
60a160f3-d126-47d2-bdc7-148389b98504	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	2	{"fields": [{"type": "text", "label": {"en": "H", "hi": "H", "ta": "H"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "h"}, {"type": "document", "label": {"en": "JL", "hi": "BJKJ", "ta": "JL"}, "order": 1, "options": [], "is_fixed": false, "required": true, "column_name": "bb"}], "description": "sgs", "display_label": "teseter2", "excluded_fixed_columns": []}	f	2026-05-13 23:38:34.669745+05:30	24841969-f268-4e31-b939-7e1ce508c627
55f3a875-b8c9-4679-806f-88fd5c7c2ea2	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	3	{"fields": [{"type": "document", "label": {"en": "JL", "hi": "BJKJ", "ta": "JL"}, "order": 0, "options": [], "is_fixed": false, "required": true, "column_name": "bb"}], "description": "sgs", "display_label": "teseter2", "excluded_fixed_columns": []}	f	2026-05-13 23:50:43.284966+05:30	24841969-f268-4e31-b939-7e1ce508c627
d4909b47-f9ff-4e0f-8041-b449c387b24f	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	4	{"fields": [{"type": "text", "label": {"en": "sdfd", "hi": "sfsd", "ta": "sdf"}, "order": 0, "options": [], "is_fixed": false, "required": false, "column_name": "fss"}], "description": "sgs", "display_label": "teseter2", "excluded_fixed_columns": []}	t	2026-05-13 23:57:39.443085+05:30	24841969-f268-4e31-b939-7e1ce508c627
c924ab05-1a96-4782-8413-654cf1ca3eb5	abcdef	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	1	{"fields": [{"type": "text", "label": {"en": "teset", "hi": "abcdef", "ta": "abcdef"}, "order": 0, "options": [], "is_fixed": false, "required": false, "column_name": "abcdef"}, {"type": "document", "label": {"en": "doc", "hi": "doc", "ta": "doc"}, "order": 1, "options": [], "is_fixed": false, "required": false, "column_name": "doc"}], "description": "abcdef", "display_label": "abcdef", "excluded_fixed_columns": []}	f	2026-05-20 23:05:22.016802+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
88d74fd3-fec3-445d-b0bc-331ee434e9a1	abcdef	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	2	{"fields": [{"type": "text", "label": {"en": "teset", "hi": "abcdef", "ta": "abcdef"}, "order": 0, "options": [], "is_fixed": false, "required": false, "column_name": "abcdef"}, {"type": "document", "label": {"en": "doc", "hi": "doc", "ta": "doc"}, "order": 1, "options": [], "is_fixed": false, "required": false, "column_name": "doc"}, {"type": "text", "label": {"en": "vv", "hi": "vv", "ta": "vv"}, "order": 2, "options": [], "is_fixed": false, "required": false, "column_name": "vv"}], "description": "abcdef", "display_label": "abcdef", "excluded_fixed_columns": []}	f	2026-05-20 23:08:08.871023+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
419aaadf-802d-43f7-8891-468c42cfd700	abcdef	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	3	{"fields": [{"type": "document", "label": {"en": "doc", "hi": "doc", "ta": "doc"}, "order": 0, "options": [], "is_fixed": false, "required": false, "column_name": "doc"}, {"type": "text", "label": {"en": "vv", "hi": "vv", "ta": "vv"}, "order": 1, "options": [], "is_fixed": false, "required": false, "column_name": "vv"}], "description": "abcdef", "display_label": "abcdef", "excluded_fixed_columns": []}	t	2026-05-20 23:24:10.848869+05:30	1503c19f-8972-40b5-aa27-877daf8d82e0
\.


--
-- TOC entry 5202 (class 0 OID 145094)
-- Dependencies: 219
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (department_id, institution_id, name, code, status, created_at, updated_at, created_by, updated_by) FROM stdin;
bbbbbbbb-0000-0000-0000-000000000001	aaaaaaaa-0000-0000-0000-000000000001	Computer Science and Engineering	CSE	ACTIVE	2026-04-25 21:26:07.007605+05:30	2026-04-25 21:26:07.007605+05:30	\N	\N
bbbbbbbb-0000-0000-0000-000000000002	aaaaaaaa-0000-0000-0000-000000000001	Information Technology	IT	ACTIVE	2026-04-25 21:26:07.007605+05:30	2026-04-25 21:26:07.007605+05:30	\N	\N
bbbbbbbb-0000-0000-0000-000000000003	aaaaaaaa-0000-0000-0000-000000000001	Electronics and Communication	ECE	ACTIVE	2026-04-25 21:26:07.007605+05:30	2026-04-25 21:26:07.007605+05:30	\N	\N
a22575fd-14f9-4b60-ab59-11ee5a524dd8	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	Panchakarma Dept	P001	INACTIVE	2026-04-26 14:19:35.428216+05:30	2026-04-29 23:19:54.154427+05:30	99b9192d-1342-4883-b9a7-5fb701da5180	99b9192d-1342-4883-b9a7-5fb701da5180
2c123037-ba6a-4922-8786-2c51a647ac90	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	Kayachikitsa	K001	ACTIVE	2026-04-27 21:22:30.785088+05:30	2026-04-29 23:29:58.199417+05:30	99b9192d-1342-4883-b9a7-5fb701da5180	99b9192d-1342-4883-b9a7-5fb701da5180
37ee9bdd-334b-4bc7-a6a5-0f7d468c9f28	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	Dravyaguna	D001	INACTIVE	2026-05-02 23:54:53.236101+05:30	2026-05-02 23:56:53.416273+05:30	99b9192d-1342-4883-b9a7-5fb701da5180	99b9192d-1342-4883-b9a7-5fb701da5180
\.


--
-- TOC entry 5223 (class 0 OID 145437)
-- Dependencies: 240
-- Data for Name: erfa_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.erfa_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, sada) FROM stdin;
\.


--
-- TOC entry 5218 (class 0 OID 145363)
-- Dependencies: 235
-- Data for Name: form_lock_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.form_lock_config (id, form_name, institution_id, is_locked, locked_by, locked_at, created_at, updated_at) FROM stdin;
07e8363b-5a14-4b79-a425-ca4b93ea248f	tester_rohit	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	f	\N	\N	2026-05-07 23:07:47.945685+05:30	2026-05-07 23:07:47.945685+05:30
4c44a5c6-9a1a-4b01-9a13-c7f5001e5a26	heheh	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	f	\N	\N	2026-05-07 23:09:47.116984+05:30	2026-05-07 23:09:47.116984+05:30
d4c6b654-7c26-46d9-9238-1d365c57015d	heheh2	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	f	\N	\N	2026-05-07 23:12:38.192666+05:30	2026-05-07 23:12:38.192666+05:30
5a752158-9269-4711-8ffd-307debdcd0cb	erfa	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	f	\N	\N	2026-05-07 23:39:57.255831+05:30	2026-05-07 23:39:57.255831+05:30
a7a10888-f7bf-48e1-b1b1-63d7e0f2f522	teseter2	aaaaaaaa-0000-0000-0000-000000000001	f	\N	\N	2026-05-13 22:46:05.601119+05:30	2026-05-13 22:46:05.601119+05:30
89103db4-3626-4679-a69b-968079fe0542	abcdef	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	f	\N	\N	2026-05-20 23:05:22.016802+05:30	2026-05-20 23:05:22.016802+05:30
\.


--
-- TOC entry 5222 (class 0 OID 145427)
-- Dependencies: 239
-- Data for Name: heheh2_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.heheh2_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, testing) FROM stdin;
\.


--
-- TOC entry 5221 (class 0 OID 145417)
-- Dependencies: 238
-- Data for Name: heheh_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.heheh_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, testing) FROM stdin;
\.


--
-- TOC entry 5203 (class 0 OID 145103)
-- Dependencies: 220
-- Data for Name: institutions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.institutions (institution_id, institution_name, code, email_domain, address_line1, address_line2, city, state, country, pincode, status, created_at, updated_at, created_by, updated_by) FROM stdin;
aaaaaaaa-0000-0000-0000-000000000001	AIIA Institute of Technology	AIIA	aiia.edu.in	123 Knowledge Park, Whitefield	\N	Bengaluru	Karnataka	India	560066	ACTIVE	2026-04-25 21:26:07.007605+05:30	2026-04-26 13:42:14.478888+05:30	\N	99b9192d-1342-4883-b9a7-5fb701da5180
9e2eb6f7-aa57-4262-bb28-a526c7e0511b	AIIA	002	aiiaayush.edu.in	New delhi	\N	Delhi	Delhi	India	110001	ACTIVE	2026-04-26 14:06:01.14592+05:30	2026-04-26 20:42:43.066025+05:30	99b9192d-1342-4883-b9a7-5fb701da5180	99b9192d-1342-4883-b9a7-5fb701da5180
\.


--
-- TOC entry 5204 (class 0 OID 145113)
-- Dependencies: 221
-- Data for Name: management_committees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.management_committees (id, institute_id, finance_year, committee_type, members, "position", contact, status, created_by, updated_by, created_at, updated_at) FROM stdin;
1	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2027-2028	GB	[{"name": "Moulini", "designation": "B.E"}]	CHAIRPERSON	\N	ACTIVE	\N	\N	2026-05-01 21:57:23.997315+05:30	2026-05-01 21:57:38.801383+05:30
\.


--
-- TOC entry 5207 (class 0 OID 145125)
-- Dependencies: 224
-- Data for Name: medical_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.medical_reports (period, x_ray, usg, bmd, ct_scan) FROM stdin;
Apr-24	850	1097	31	90
May-24	929	1152	58	129
Jun-24	767	1163	20	93
Jul-24	991	1181	18	82
Aug-24	849	910	7	114
Sep-24	905	1209	71	111
Oct-24	684	896	136	60
Nov-24	778	1107	10	42
Dec-24	778	1125	7	69
Feb-25	775	794	16	59
Mar-25	1001	1006	27	50
Total	10159	12704	406	960
Apr-25	90	90	90	90
May-25	1000	1000	80	90
Jan-25	852	1064	5	61
Jun-25	900	900	90	90
Jul-25	900	900	900	80
\.


--
-- TOC entry 5208 (class 0 OID 145130)
-- Dependencies: 225
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_templates (id, event_id, label, email_enabled, app_enabled, email_subject, email_body, app_message, updated_at, updated_by, role_group, category, is_active) FROM stdin;
9a0aba62-6483-4e27-aa55-b71be3b0d818	password_reset	Password Reset	t	f	Reset your {AppName} password	Hi {UserName},\n \nWe received a request to reset your password for {AppName}.\n \nClick the link below to set a new password:\n{LoginURL}\n \nThis link expires in 30 minutes. If you did not request this, please ignore this email.\n \n— {AppName} Security Team		2026-05-02 14:58:03.528866	\N	system	Security	t
939b1cc8-7f1b-4349-9e6a-ad3a5fd51cd5	account_suspended	Account Suspended	t	t	Your {AppName} account has been suspended	Hi {UserName},\n \nYour account on {AppName} has been suspended by an administrator.\n \nIf you believe this is a mistake, please contact your institution admin.\n \n— {AppName} Team	Your {AppName} account has been suspended. Contact your admin for assistance.	2026-05-02 14:58:03.528866	\N	system	Security	t
ee3c3044-b9de-4b5f-a06a-9cd788cf4c47	user_created	New User Created	t	t	Welcome to {AppName} — Your Account is Ready	Hi {UserName},\n \nAn account has been created for you on {AppName}.\n \n  Email Address : {Email}\n  Temp Password : {TempPassword}\n \nFor security, you will be required to set a new password on your first login.\n \nLog in here: {LoginURL}\n \nIf you did not expect this email, please contact support.\n \n— {AppName} Team	Welcome {UserName}! Your account on {AppName} is ready. Tap to log in.	2026-05-02 15:01:27.350228	99b9192d-1342-4883-b9a7-5fb701da5180	super_admin	User Management	t
c9dba787-a976-4e2e-aaf6-028777c21af5	user_role_updated	User Role Updated	t	t	Your role on {AppName} has been updated	Hi {UserName},\n \nYour role on {AppName} has been updated to {NewRole}.\n \nIf you have any questions, please contact your administrator.\n \n— {AppName} Team	Your role on {AppName} has been updated to {NewRole}.	2026-05-02 23:17:26.88429	\N	super_admin	User Management	t
e4ea129d-d4f7-4dcc-921c-59db2359752f	user_account_activated	Account Activated	t	t	Your {AppName} account has been reactivated	Hi {UserName},\n \nGreat news — your account on {AppName} has been reactivated.\n \nYou can now log in at: {LoginURL}\n \n— {AppName} Team	Your {AppName} account has been reactivated. You can now log in.	2026-05-02 23:17:26.88429	\N	super_admin	User Management	t
c001be51-73ad-444d-a7ff-5260dcca801b	department_admin_assigned	Department Admin Assigned	t	t	You have been assigned as Department Admin on {AppName}	Hi {UserName},\n \nYou have been assigned as the Department Admin for "{DepartmentName}" on {AppName}.\n \nLog in here: {LoginURL}\n \n— {AppName} Team	You have been assigned as Department Admin for "{DepartmentName}".	2026-05-02 23:17:46.02477	\N	super_admin	Department Setup	t
a9bb2bed-48ee-4780-b25b-b1b510ea0b0b	dept_all_sections_submitted	Department Submitted All Sections	f	t	{DepartmentName} has submitted all sections	Hi {UserName},\n \nThe department "{DepartmentName}" has successfully submitted all sections on {AppName}.\n \n— {AppName} Team	"{DepartmentName}" has submitted all sections.	2026-05-02 23:18:05.102549	\N	super_admin	Monitoring	t
21b54370-c963-406d-8717-788bdf5a4dd5	dept_deadline_approaching	Submission Deadline Approaching	t	t	Submission deadline approaching for {DepartmentName}	Hi {UserName},\n \nThe submission deadline for "{DepartmentName}" is approaching on {AppName}. Please ensure all sections are submitted in time.\n \n— {AppName} Team	Deadline approaching: "{DepartmentName}" submission due soon.	2026-05-02 23:18:05.102549	\N	super_admin	Monitoring	t
00779b0a-69ea-4bda-85fc-6f2dee02e8f8	dept_deadline_missed	Submission Deadline Missed	t	t	{DepartmentName} missed the submission deadline	Hi {UserName},\n \nThe department "{DepartmentName}" has missed the submission deadline on {AppName}.\n \n— {AppName} Team	"{DepartmentName}" missed the submission deadline.	2026-05-02 23:18:05.102549	\N	super_admin	Monitoring	t
233fa6b2-b108-42b3-9761-a58514425860	report_director_rejected	Director Rejected Final Report	t	t	Final report rejected by Director on {AppName}	Hi {UserName},\n \nThe final report has been rejected by the Director on {AppName}. Please review and resubmit.\n \n— {AppName} Team	Final report rejected by Director. Review required.	2026-05-02 23:18:21.33199	\N	super_admin	Approval Oversight	t
763d6d5f-65fa-4278-9ab6-c2f271784991	account_reactivated	Account Reactivated	t	t	Your {AppName} account has been reactivated	Hi {UserName},\n \nGreat news — your account on {AppName} has been reactivated.\n \nYou can now log in at: {LoginURL}\n \n— {AppName} Team	Your {AppName} account has been reactivated. You can now log in.	2026-05-02 14:58:03.528866	\N	system	Security	t
0fd11d08-7945-44ea-b2f0-8da1c59a8fec	report_director_approved	Director Approved Final Report	t	t	Final report approved by Director on {AppName}	Hi {UserName},\n \nThe final report has been approved by the Director on {AppName}.\n \n— {AppName} Team	Final report approved by Director.	2026-05-02 23:53:11.546885	99b9192d-1342-4883-b9a7-5fb701da5180	super_admin	Approval Oversight	t
b21d8b49-0fef-42f6-86ad-03962b9272c6	department_created	New Department Created	t	t	New department created on {AppName}	Hi {UserName},\n \nA new department "{DepartmentName}" has been created on {AppName}.\n \n— {AppName} Team	New department "{DepartmentName}" has been created.	2026-05-02 23:56:32.656362	99b9192d-1342-4883-b9a7-5fb701da5180	super_admin	Department Setup	t
99614a36-091a-485c-9e1d-d2d8fd354fb3	user_permissions_modified	User Permissions Modified	t	t	Your permissions on {AppName} have been modified	Hi {UserName},\n \nYour permissions on {AppName} have been modified by an administrator.\n \n— {AppName} Team	Your permissions on {AppName} have been modified.	2026-05-02 23:58:11.652627	99b9192d-1342-4883-b9a7-5fb701da5180	super_admin	User Management	t
695969cf-c809-40f9-a99e-ea9512b25cec	department_updated	Department Details Updated	t	t	Department details updated on {AppName}	Hi {UserName},\n \nThe department "{DepartmentName}" details have been updated on {AppName}.\n \n— {AppName} Team	Department "{DepartmentName}" details have been updated.	2026-05-02 23:56:35.86972	99b9192d-1342-4883-b9a7-5fb701da5180	super_admin	Department Setup	t
ccd76b2a-055a-443d-951d-2ab493a0634c	report_published	Report Published Successfully	t	t	Report published successfully on {AppName}	Hi {UserName},\n \nThe report has been published successfully on {AppName}.\n \n— {AppName} Team	Report published successfully on {AppName}.	2026-05-02 23:18:21.33199	\N	super_admin	Approval Oversight	t
949ab366-4a00-4f17-9901-3431f17e7127	system_failed_login	Failed Login Attempts Detected	t	t	Security alert: Failed login attempts detected on {AppName}	Hi {UserName},\n \nMultiple failed login attempts have been detected on {AppName}. Please review security logs.\n \n— {AppName} Security Team	Security alert: Multiple failed login attempts detected.	2026-05-02 23:18:41.846846	\N	super_admin	System Alerts	t
14063d2f-3a59-46b2-9669-10931b75e201	system_error	System Error Occurred	t	t	System error detected on {AppName}	Hi {UserName},\n \nA system error has occurred on {AppName}. Our team is investigating.\n \n— {AppName} Team	System error detected on {AppName}. Team is investigating.	2026-05-02 23:18:41.846846	\N	super_admin	System Alerts	t
ba991f53-f884-4d1c-8250-f0c63132b5b8	system_high_activity	High Volume Activity Detected	f	t	High activity volume detected on {AppName}	Hi {UserName},\n \nUnusually high activity volume has been detected on {AppName}.\n \n— {AppName} Team	High volume activity detected on {AppName}.	2026-05-02 23:18:41.846846	\N	super_admin	System Alerts	t
58631af8-6046-44df-b9d3-17e98c0f8542	nodal_officer_assigned	Nodal Officer Assigned	t	t	You have been assigned as Nodal Officer on {AppName}	Hi {UserName},\n \nYou have been assigned as a Nodal Officer for "{DepartmentName}" on {AppName}.\n \nLog in here: {LoginURL}\n \n— {AppName} Team	You have been assigned as Nodal Officer for "{DepartmentName}".	2026-05-02 23:19:01.19687	\N	department_admin	Team Management	t
01012079-13c1-4f91-9e24-57f7f2498d04	nodal_officer_removed	Nodal Officer Removed	t	t	Nodal officer removed from {AppName}	Hi {UserName},\n \nA nodal officer has been removed from "{DepartmentName}" on {AppName}.\n \n— {AppName} Team	Nodal officer removed from "{DepartmentName}".	2026-05-02 23:19:01.19687	\N	department_admin	Team Management	t
e7afff7f-dc4a-4884-bc11-7568d657f96c	section_assigned_to_nodal	Section Assigned to Nodal Officer	f	t	Section assigned to nodal officer on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been assigned to a nodal officer on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" assigned to nodal officer.	2026-05-02 23:19:01.19687	\N	department_admin	Team Management	t
81995ed6-7f32-47a0-95ab-c2e2efc59a5e	section_assigned_to_dept	Section Assigned to Department	f	t	New section assigned to your department on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been assigned to your department on {AppName}.\n \n— {AppName} Team	New section "{SectionName}" assigned to your department.	2026-05-02 23:19:16.459597	\N	department_admin	Section Progress	t
bde9c9ac-8b17-4219-8eb0-82e6eadf8ae4	section_submitted_by_nodal	Section Submitted by Nodal Officer	f	t	Section submitted by nodal officer on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been submitted by the nodal officer on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" submitted by nodal officer.	2026-05-02 23:19:16.459597	\N	department_admin	Section Progress	t
259a45d7-717a-4ae6-8e77-69b503e868bf	section_updated_after_submit	Section Updated After Submission	f	t	Section updated after submission on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been updated after submission on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" updated after submission.	2026-05-02 23:19:16.459597	\N	department_admin	Section Progress	t
9bcd3fd4-e34a-4c65-90ec-9d87ae9fa504	da_deadline_approaching	Submission Deadline Approaching	t	t	Submission deadline approaching on {AppName}	Hi {UserName},\n \nThe submission deadline is approaching on {AppName}. Please ensure all sections are submitted in time.\n \n— {AppName} Team	Submission deadline approaching. Please submit all sections in time.	2026-05-02 23:19:29.588611	\N	department_admin	Deadlines	t
a2f141ce-cb01-42c3-8b3e-d52f7bad06ba	da_deadline_missed	Submission Deadline Missed	t	t	Submission deadline missed on {AppName}	Hi {UserName},\n \nYour department has missed the submission deadline on {AppName}.\n \n— {AppName} Team	Submission deadline missed on {AppName}.	2026-05-02 23:19:29.588611	\N	department_admin	Deadlines	t
5d1adbd3-5398-44b3-a840-04cd5386b0ff	section_sent_back_rework	Section Sent Back for Rework	t	t	Section sent back for rework on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been sent back for rework on {AppName}. Please review and resubmit.\n \n— {AppName} Team	Section "{SectionName}" sent back for rework.	2026-05-02 23:19:43.527757	\N	department_admin	Review Cycle	t
cdb33356-e7db-43f9-bdd9-6e1bcc498578	section_approved_nodal	Section Approved by Nodal Officer	f	t	Section approved on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been approved by the nodal officer on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" approved by nodal officer.	2026-05-02 23:19:43.527757	\N	department_admin	Review Cycle	t
3455e085-5325-455f-bedb-c6c891eeffdc	dept_report_submitted	Department Report Submitted	t	t	Department report submitted successfully on {AppName}	Hi {UserName},\n \nYour department report has been submitted successfully on {AppName}.\n \n— {AppName} Team	Department report submitted successfully.	2026-05-02 23:19:55.29421	\N	department_admin	Submission	t
e3219e75-4c65-47f9-9edc-1c1aebb3c847	dept_report_resubmitted	Department Report Resubmitted	f	t	Department report resubmitted on {AppName}	Hi {UserName},\n \nYour department report has been resubmitted on {AppName}.\n \n— {AppName} Team	Department report resubmitted on {AppName}.	2026-05-02 23:19:55.29421	\N	department_admin	Submission	t
db7ed692-f3ea-4842-9e90-2706072466a8	no_section_assigned	New Section Assigned	t	t	New section assigned to you on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been assigned to you on {AppName}. Please log in to begin.\n \nLog in here: {LoginURL}\n \n— {AppName} Team	New section "{SectionName}" assigned to you.	2026-05-02 23:20:14.035719	\N	nodal_officer	Assignment	t
0bd7928e-d219-4d5c-b84c-1e545a6e2f7f	no_section_reassigned	Section Reassigned	f	t	Section reassigned on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been reassigned on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" has been reassigned.	2026-05-02 23:20:14.035719	\N	nodal_officer	Assignment	t
7708feb7-e317-40bd-a2a1-a418296e6d0b	no_draft_autosaved	Draft Auto-Saved	f	t	Draft auto-saved on {AppName}	Hi {UserName},\n \nYour draft for section "{SectionName}" has been auto-saved on {AppName}.\n \n— {AppName} Team	Draft for "{SectionName}" auto-saved.	2026-05-02 23:20:28.631872	\N	nodal_officer	Work Updates	t
5d01f902-972a-4e13-83c1-71164a6223de	no_section_edited_other	Section Edited by Another User	f	t	Section edited by another user on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been edited by another user on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" edited by another user.	2026-05-02 23:20:28.631872	\N	nodal_officer	Work Updates	t
c2ea0c4d-3f3b-497e-b850-376ecbdb6d76	no_required_fields_missing	Required Fields Missing	f	t	Required fields missing in section on {AppName}	Hi {UserName},\n \nSome required fields are missing in section "{SectionName}" on {AppName}. Please complete them before submitting.\n \n— {AppName} Team	Required fields missing in "{SectionName}". Please complete before submitting.	2026-05-02 23:20:43.339518	\N	nodal_officer	Validation	t
1ffb368f-e3a5-4d5a-b383-66915906e9d1	no_invalid_data	Invalid Data Detected	f	t	Invalid data detected in section on {AppName}	Hi {UserName},\n \nInvalid data has been detected in section "{SectionName}" on {AppName}. Please review and correct.\n \n— {AppName} Team	Invalid data detected in "{SectionName}". Please review.	2026-05-02 23:20:43.339518	\N	nodal_officer	Validation	t
e0b2f7f3-3e90-42c6-b3b7-5c18da859f4e	no_deadline_approaching	Submission Deadline Approaching	t	t	Section submission deadline approaching on {AppName}	Hi {UserName},\n \nThe submission deadline for section "{SectionName}" is approaching on {AppName}.\n \n— {AppName} Team	Deadline approaching for section "{SectionName}".	2026-05-02 23:21:03.429917	\N	nodal_officer	Deadlines	t
c2bcc803-55b8-432d-898f-1cd0a9841818	no_submission_overdue	Submission Overdue	t	t	Section submission overdue on {AppName}	Hi {UserName},\n \nThe submission for section "{SectionName}" is overdue on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" submission is overdue.	2026-05-02 23:21:03.429917	\N	nodal_officer	Deadlines	t
689bffa1-e710-426d-8d09-512c2165d820	no_section_submitted	Section Submitted Successfully	f	t	Section submitted successfully on {AppName}	Hi {UserName},\n \nSection "{SectionName}" has been submitted successfully on {AppName}.\n \n— {AppName} Team	Section "{SectionName}" submitted successfully.	2026-05-02 23:21:19.677382	\N	nodal_officer	Submission	t
0cf08995-6a75-4538-8d85-ea5c5cd35ebe	no_resubmission_requested	Section Resubmission Requested	t	t	Section resubmission requested on {AppName}	Hi {UserName},\n \nA resubmission has been requested for section "{SectionName}" on {AppName}. Please review and resubmit.\n \n— {AppName} Team	Resubmission requested for section "{SectionName}".	2026-05-02 23:21:19.677382	\N	nodal_officer	Submission	t
ce97ebeb-0b71-448a-ab78-c71eff1d2f0c	pc_new_report_submitted	New Department Report Submitted	f	t	New department report submitted on {AppName}	Hi {UserName},\n \nA new department report from "{DepartmentName}" has been submitted on {AppName} and is ready for review.\n \n— {AppName} Team	New report from "{DepartmentName}" submitted for review.	2026-05-02 23:21:33.158938	\N	publication_cell	Incoming Reports	t
09529ade-e634-48be-9313-7a3ad6dea4d9	pc_multiple_reports_submitted	Multiple Departments Submitted	f	t	Multiple department reports submitted on {AppName}	Hi {UserName},\n \nMultiple department reports have been submitted on {AppName} and are ready for review.\n \n— {AppName} Team	Multiple department reports submitted and ready for review.	2026-05-02 23:21:33.158938	\N	publication_cell	Incoming Reports	t
99c1c13f-9650-4291-b100-4b19f9e9a80c	pc_report_ready_review	Report Ready for Review	f	t	Report ready for review on {AppName}	Hi {UserName},\n \nA report is ready for your review on {AppName}.\n \n— {AppName} Team	Report ready for your review on {AppName}.	2026-05-02 23:21:49.964282	\N	publication_cell	Review Process	t
f8660550-e792-4e45-af8a-48abd1359523	pc_review_started	Review Started	f	t	Report review started on {AppName}	Hi {UserName},\n \nReview of the report has been started on {AppName}.\n \n— {AppName} Team	Report review started on {AppName}.	2026-05-02 23:21:49.964282	\N	publication_cell	Review Process	t
932dec02-c9e2-4656-a4ef-9203eb256796	pc_review_completed	Review Completed	f	t	Report review completed on {AppName}	Hi {UserName},\n \nReview of the report has been completed on {AppName}.\n \n— {AppName} Team	Report review completed on {AppName}.	2026-05-02 23:21:49.964282	\N	publication_cell	Review Process	t
ab32c160-0a29-4ca7-a37e-46ec1383f602	pc_report_sent_back	Report Sent Back for Corrections	t	t	Report sent back for corrections on {AppName}	Hi {UserName},\n \nThe report has been sent back for corrections on {AppName}. Please review and resubmit.\n \n— {AppName} Team	Report sent back for corrections. Please review and resubmit.	2026-05-02 23:22:02.234467	\N	publication_cell	Corrections	t
d4aec250-49f5-42bb-90d8-fc706baf1c1b	pc_corrections_received	Corrections Received	f	t	Corrected report received on {AppName}	Hi {UserName},\n \nA corrected report has been received on {AppName} and is ready for re-review.\n \n— {AppName} Team	Corrected report received and ready for re-review.	2026-05-02 23:22:02.234467	\N	publication_cell	Corrections	t
58214181-4156-49b7-b3a6-b6178fafc0ba	pc_report_approved	Report Approved	f	t	Report approved on {AppName}	Hi {UserName},\n \nThe report has been approved on {AppName}.\n \n— {AppName} Team	Report approved on {AppName}.	2026-05-02 23:22:22.155964	\N	publication_cell	Approval	t
e132e0e4-b17b-4849-b0a9-1e80225301a4	pc_report_rejected	Report Rejected	t	t	Report rejected on {AppName}	Hi {UserName},\n \nThe report has been rejected on {AppName}. Please review feedback and resubmit.\n \n— {AppName} Team	Report rejected on {AppName}. Review feedback and resubmit.	2026-05-02 23:22:22.155964	\N	publication_cell	Approval	t
035696a4-e500-4d3f-8412-fb6f2a578d4a	pc_report_ready_publish	Report Ready for Publishing	f	t	Report ready for publishing on {AppName}	Hi {UserName},\n \nThe report is ready for publishing on {AppName}.\n \n— {AppName} Team	Report ready for publishing on {AppName}.	2026-05-02 23:22:22.155964	\N	publication_cell	Publishing	t
7b61bf3c-30c0-490e-9253-fa74fa772dfe	pc_report_published	Report Published Successfully	t	t	Report published successfully on {AppName}	Hi {UserName},\n \nThe report has been published successfully on {AppName}.\n \n— {AppName} Team	Report published successfully on {AppName}.	2026-05-02 23:22:22.155964	\N	publication_cell	Publishing	t
b10ae82d-4f5f-44e1-9896-c21c087b6a98	pc_publishing_failed	Publishing Failed	t	t	Report publishing failed on {AppName}	Hi {UserName},\n \nReport publishing has failed on {AppName}. Please try again or contact support.\n \n— {AppName} Team	Report publishing failed on {AppName}. Please retry.	2026-05-02 23:22:22.155964	\N	publication_cell	Publishing	t
38a1b352-23ba-4bc2-b7a9-d4ce4306b7c3	fo_financial_section_submitted	Financial Section Submitted	f	t	Financial section submitted on {AppName}	Hi {UserName},\n \nA financial section has been submitted on {AppName} and is ready for review.\n \n— {AppName} Team	Financial section submitted and ready for review.	2026-05-02 23:22:42.979564	\N	finance_officer	Financial Data	t
c23380ad-8a56-47d5-ab23-658456b7931a	fo_financial_data_updated	Financial Data Updated	f	t	Financial data updated on {AppName}	Hi {UserName},\n \nFinancial data has been updated on {AppName}.\n \n— {AppName} Team	Financial data updated on {AppName}.	2026-05-02 23:22:42.979564	\N	finance_officer	Financial Data	t
ba793230-0300-46ab-9bca-1664bc44cfde	fo_data_pending_review	Financial Data Pending Review	f	t	Financial data pending review on {AppName}	Hi {UserName},\n \nFinancial data is pending review on {AppName}.\n \n— {AppName} Team	Financial data pending your review on {AppName}.	2026-05-02 23:22:42.979564	\N	finance_officer	Verification	t
caf7b374-571a-433c-9bdd-cac5cb333a7e	fo_discrepancies_detected	Financial Discrepancies Detected	t	t	Financial discrepancies detected on {AppName}	Hi {UserName},\n \nFinancial discrepancies have been detected on {AppName}. Please review immediately.\n \n— {AppName} Team	Financial discrepancies detected. Immediate review required.	2026-05-02 23:22:42.979564	\N	finance_officer	Verification	t
88fdd72a-1bdc-4b26-b09a-c1a19a68d92a	fo_section_sent_back	Financial Section Sent Back	t	t	Financial section sent back for corrections on {AppName}	Hi {UserName},\n \nThe financial section has been sent back for corrections on {AppName}.\n \n— {AppName} Team	Financial section sent back for corrections.	2026-05-02 23:22:42.979564	\N	finance_officer	Corrections	t
3f0dce09-629f-4fdf-b8b2-13ba83d71a10	fo_corrected_data_received	Corrected Financial Data Received	f	t	Corrected financial data received on {AppName}	Hi {UserName},\n \nCorrected financial data has been received on {AppName}.\n \n— {AppName} Team	Corrected financial data received on {AppName}.	2026-05-02 23:22:42.979564	\N	finance_officer	Corrections	t
551b1518-858c-4b4a-a8d2-1915bb2bc679	fo_data_approved	Financial Data Approved	f	t	Financial data approved on {AppName}	Hi {UserName},\n \nThe financial data has been approved on {AppName}.\n \n— {AppName} Team	Financial data approved on {AppName}.	2026-05-02 23:22:42.979564	\N	finance_officer	Approval	t
3bf65c05-d6bd-4b3d-8609-b2c08246f1b2	fo_data_rejected	Financial Data Rejected	t	t	Financial data rejected on {AppName}	Hi {UserName},\n \nThe financial data has been rejected on {AppName}. Please review and resubmit.\n \n— {AppName} Team	Financial data rejected. Please review and resubmit.	2026-05-02 23:22:42.979564	\N	finance_officer	Approval	t
48b233ab-d498-421d-8910-77109d293c21	fo_included_in_report	Financial Report Included in Final Report	f	t	Financial report included in final report on {AppName}	Hi {UserName},\n \nThe financial report has been included in the final report on {AppName}.\n \n— {AppName} Team	Financial report included in final report.	2026-05-02 23:22:42.979564	\N	finance_officer	Finalization	t
8ef1d506-55a9-4691-b7c3-25027d47bdea	fo_budget_summary_generated	Budget Summary Generated	f	t	Budget summary generated on {AppName}	Hi {UserName},\n \nThe budget summary has been generated on {AppName}.\n \n— {AppName} Team	Budget summary generated on {AppName}.	2026-05-02 23:22:42.979564	\N	finance_officer	Finalization	t
a39a4bdb-b40f-400d-bdd5-8b263ea64c96	workflow_stage_changed	Workflow Stage Changed	f	t	Workflow stage updated on {AppName}	Hi {UserName},\n \nThe workflow stage has been updated on {AppName}.\n \n— {AppName} Team	Workflow stage updated on {AppName}.	2026-05-02 23:23:12.428904	\N	system	Workflow Events	t
fffbe642-1b3f-483a-8d2e-4e4a4f646e98	workflow_status_changed	Workflow Status Changed	f	t	Workflow status changed on {AppName}	Hi {UserName},\n \nThe workflow status has changed on {AppName}.\n \n— {AppName} Team	Workflow status changed on {AppName}.	2026-05-02 23:23:12.428904	\N	system	Workflow Events	t
e41fd099-51a6-4c76-972e-2f361eb249ed	audit_major_update	Major Data Update Recorded	f	t	Major data update recorded on {AppName}	Hi {UserName},\n \nA major data update has been recorded on {AppName}.\n \n— {AppName} Team	Major data update recorded on {AppName}.	2026-05-02 23:23:12.428904	\N	system	Audit & Tracking	t
50783526-c5db-4e3f-8f87-c7b042ea69ca	audit_critical_change	Critical Change Detected	t	t	Critical change detected on {AppName}	Hi {UserName},\n \nA critical change has been detected on {AppName}. Please review immediately.\n \n— {AppName} Team	Critical change detected on {AppName}. Immediate review required.	2026-05-02 23:23:12.428904	\N	system	Audit & Tracking	t
00e6d220-9597-47b2-8149-60cca84306f3	reminder_daily_pending	Daily Reminder for Pending Tasks	f	t	You have pending tasks on {AppName}	Hi {UserName},\n \nYou have pending tasks on {AppName}. Please log in to review.\n \n— {AppName} Team	You have pending tasks on {AppName}. Please review.	2026-05-02 23:23:12.428904	\N	system	Reminders	t
b7311e56-f214-4d44-8a1d-c654c486d89d	reminder_final_deadline	Final Deadline Reminder	t	t	Final deadline reminder for {AppName}	Hi {UserName},\n \nThis is your final deadline reminder on {AppName}. Please complete all pending actions immediately.\n \n— {AppName} Team	Final deadline reminder. Complete all pending actions immediately.	2026-05-02 23:23:12.428904	\N	system	Reminders	t
72c55ac7-50de-46d3-ba8d-099b813c9c76	broadcast_announcement	Announcement from Super Admin	t	t	Important announcement from {AppName}	Hi {UserName},\n \n{AnnouncementText}\n \n— {AppName} Team	{AnnouncementText}	2026-05-02 23:23:12.428904	\N	system	Broadcast	t
6da4308e-be01-478b-ac46-16f55d7d976c	broadcast_maintenance	System Maintenance Scheduled	t	t	Scheduled maintenance on {AppName}	Hi {UserName},\n \n{AppName} will undergo scheduled maintenance on {MaintenanceDate}. The system may be temporarily unavailable.\n \n— {AppName} Team	{AppName} maintenance scheduled for {MaintenanceDate}.	2026-05-02 23:23:12.428904	\N	system	Broadcast	t
49775b6e-d111-4727-84ea-1c2fc69af605	broadcast_downtime	System Downtime Alert	t	t	System downtime alert for {AppName}	Hi {UserName},\n \n{AppName} is currently experiencing downtime. Our team is working to restore service.\n \n— {AppName} Team	{AppName} is experiencing downtime. Team is working to restore service.	2026-05-02 23:23:12.428904	\N	system	Broadcast	t
\.


--
-- TOC entry 5209 (class 0 OID 145143)
-- Dependencies: 226
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, event_id, title, message, is_read, created_at) FROM stdin;
2	89f764b2-568e-490a-932b-f80da9a89530	user_created	Welcome to Pragati Mitra — Your Account is Ready	Welcome Moulini! Your account on Pragati Mitra is ready. Tap to log in.	t	2026-05-02 20:13:29.296728+05:30
3	c9a6db66-340f-425e-8fbc-7d1b3abc21db	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Institute Admin.	f	2026-05-03 22:08:55.643806+05:30
4	cccccccc-0000-0000-0000-000000000002	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Institute Admin.	f	2026-05-03 22:08:55.849112+05:30
5	89f764b2-568e-490a-932b-f80da9a89530	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Institute Admin.	f	2026-05-03 22:08:56.097035+05:30
6	7f9e874e-1fb0-4ba9-b933-6a3d8adacee8	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Finance Officer/s.	f	2026-05-03 22:10:07.505951+05:30
7	c9573cbf-a1bc-4142-a1b4-e56bcc61d345	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Finance Officer/s.	f	2026-05-03 22:10:07.804551+05:30
8	7f9e874e-1fb0-4ba9-b933-6a3d8adacee8	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Finance Officer/s.	f	2026-05-03 22:10:14.223821+05:30
9	c9573cbf-a1bc-4142-a1b4-e56bcc61d345	user_role_updated	Your role on Pragati Mitra has been updated	Your role on Pragati Mitra has been updated to Finance Officer/s.	f	2026-05-03 22:10:14.224991+05:30
10	1503c19f-8972-40b5-aa27-877daf8d82e0	user_created	Welcome to Pragati Mitra — Your Account is Ready	Welcome iAdmin1! Your account on Pragati Mitra is ready. Tap to log in.	f	2026-05-06 23:12:10.267743+05:30
11	20facbff-eae7-4a80-9ee4-1311bab2b2da	user_created	Welcome to Pragati Mitra — Your Account is Ready	Welcome dAdmin! Your account on Pragati Mitra is ready. Tap to log in.	f	2026-05-07 23:22:27.822812+05:30
12	24841969-f268-4e31-b939-7e1ce508c627	user_created	Welcome to Pragati Mitra — Your Account is Ready	Welcome admin2! Your account on Pragati Mitra is ready. Tap to log in.	f	2026-05-13 22:43:32.602276+05:30
\.


--
-- TOC entry 5211 (class 0 OID 145151)
-- Dependencies: 228
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, display_name, description, permissions, is_system, created_at, updated_at) FROM stdin;
1228e7ec-3a62-42ec-8f41-a4ccf957e40f	super_admin	Super Admin	Full system access	{"all": true}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
f523afbc-8708-455a-b2c7-1a627036b9e5	publication_cell	Publication Cell	Manages publications pipeline	{"publications": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
d631d5fd-0366-4358-82fb-2cc8535d7193	department_admin	Department Admin	Manages department settings	{"department": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
c29dcf81-6d8f-4f7f-a2ac-85bd7b7b012b	nodal_officer	Department Nodal Officer	Nodal officer access	{"reports": ["read", "write"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
2aebfd43-49c6-4026-8869-ee20fbf5aa50	reviewer	Reviewer	Can review submissions	{"publications": ["review"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
ae958c00-cf08-47b6-b802-faefbebf2c53	directors_office	Director's Office	Director-level read access	{"all": ["read"]}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
ca2aee76-a1ee-487f-a8df-de0690a34e01	finance_officer	Finance Officer/s	Finance and budget access	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": false, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": true, "fill_finance_forms": true, "manage_departments": false, "configure_templates": false, "manage_institutions": false, "fill_institute_forms": false, "assign_roles_institute": false}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
bd86bc4f-e04e-456a-9370-683e34521671	head_of_department	Head of Department	HOD read access	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": false, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": false, "fill_finance_forms": false, "manage_departments": true, "configure_templates": false, "manage_institutions": false, "fill_institute_forms": false, "assign_roles_institute": false}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
eb21df23-350b-449d-bec8-37395c85107e	institute_admin	Institute Admin	Manages institution-level settings	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": false, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": false, "fill_finance_forms": false, "manage_departments": false, "configure_templates": false, "manage_institutions": false, "fill_institute_forms": true, "assign_roles_institute": false}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
c3dbd707-7286-4863-870b-f55195f9c70f	contributor	Contributor	Can submit publications	{"audit_logs": false, "master_data": false, "final_signoff": false, "manage_cycles": false, "compile_report": false, "delegate_nodal": false, "review_content": false, "fill_dept_forms": false, "write_narrative": false, "manage_dept_users": false, "submit_for_review": false, "upload_statements": false, "fill_finance_forms": false, "configure_templates": false, "fill_institute_forms": false, "assign_roles_institute": true}	t	2026-04-25 21:26:07.007605+05:30	2026-04-27 23:43:19.196268+05:30
\.


--
-- TOC entry 5212 (class 0 OID 145161)
-- Dependencies: 229
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, user_id, token_hash, previous_token_hash, expires_at, created_at, last_used_at) FROM stdin;
8ce0e5a6-abdf-481e-a9c0-b6f951223527	272eeb9f-7415-4287-bc36-217d8c1776ed	6777f7381b73a3c6b756c01af0ffce16acf2603d78399b08651c528e8d8cd93b	\N	2026-05-03 01:07:53.619+05:30	2026-04-26 01:07:53.620546+05:30	2026-04-26 01:07:53.620546+05:30
de2dec8e-c216-43fc-92ce-339770935b1e	e94cb1fe-7049-4d62-a269-24206459157c	b41ae026e55e94adcab3e4ceb99a6e6e022963fd2e1d0291844f246ecc02ea62	\N	2026-05-03 01:34:26.865+05:30	2026-04-26 01:34:26.866413+05:30	2026-04-26 01:34:26.866413+05:30
3f38c835-0c49-4654-bf5d-52de199802fb	cccccccc-0000-0000-0000-000000000004	e976c9a619ba28b331eb2c0b2b46fccdcf163b78f92921d4e52d8c560defab44	\N	2026-04-27 12:45:05.696+05:30	2026-04-26 12:45:05.69817+05:30	2026-04-26 12:45:05.69817+05:30
9890d989-7aed-4d1b-a16d-797343dde343	99b9192d-1342-4883-b9a7-5fb701da5180	671b011d1a0f3b10153823ae68bdb94004c149dccf900cbd550fbc1690074724	dc381dfe2f0814b7654f87a62e6afc3eaf22333a19839958a0f86b9fcd817a0f	2026-05-06 23:01:36.311+05:30	2026-05-05 22:05:35.912712+05:30	2026-05-05 23:01:36.311974+05:30
\.


--
-- TOC entry 5213 (class 0 OID 145169)
-- Dependencies: 230
-- Data for Name: svg_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.svg_reports (id, title, description, svg_data, status, chart_type, created_at, updated_at, report_data) FROM stdin;
7	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar	<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="880"><rect width="1018" height="880" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="30" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M56.8138 300l13.4184 0l0 -219.4l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M116.0638 300l13.4184 0l0 -230.4l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M175.3138 300l13.4184 0l0 -232.6l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M234.5638 300l13.4184 0l0 -236.2l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M293.8138 300l13.4184 0l0 -182l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M353.0638 300l13.4184 0l0 -241.8l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M412.3138 300l13.4184 0l0 -179.2l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M471.5638 300l13.4184 0l0 -221.4l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M530.8138 300l13.4184 0l0 -225l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M590.0638 300l13.4184 0l0 -212.8l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M649.3138 300l13.4184 0l0 -158.8l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M708.5638 300l13.4184 0l0 -201.2l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M767.8138 300l13.4184 0l0 -18l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M827.0638 300l13.4184 0l0 -200l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M886.3138 300l13.4184 0l0 -180l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M945.5638 300l13.4184 0l0 -180l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M72.9158 300l13.4184 0l0 -6.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M132.1658 300l13.4184 0l0 -11.6l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M191.4158 300l13.4184 0l0 -4l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M250.6658 300l13.4184 0l0 -3.6l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M309.9158 300l13.4184 0l0 -1.4l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M369.1658 300l13.4184 0l0 -14.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M428.4158 300l13.4184 0l0 -27.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M487.6658 300l13.4184 0l0 -2l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M546.9158 300l13.4184 0l0 -1.4l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M606.1658 300l13.4184 0l0 -1l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M665.4158 300l13.4184 0l0 -3.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M724.6658 300l13.4184 0l0 -5.4l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M783.9158 300l13.4184 0l0 -18l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M843.1658 300l13.4184 0l0 -16l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M902.4158 300l13.4184 0l0 -18l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M961.6658 300l13.4184 0l0 -180l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M89.0179 300l13.4184 0l0 -18l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M148.2679 300l13.4184 0l0 -25.8l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M207.5179 300l13.4184 0l0 -18.6l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M266.7679 300l13.4184 0l0 -16.4l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M326.0179 300l13.4184 0l0 -22.8l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M385.2679 300l13.4184 0l0 -22.2l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M444.5179 300l13.4184 0l0 -12l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M503.7679 300l13.4184 0l0 -8.4l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M563.0179 300l13.4184 0l0 -13.8l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M622.2679 300l13.4184 0l0 -12.2l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M681.5179 300l13.4184 0l0 -11.8l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M740.7679 300l13.4184 0l0 -10l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M800.0179 300l13.4184 0l0 -18l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M859.2679 300l13.4184 0l0 -18l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M918.5179 300l13.4184 0l0 -20l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M977.7679 300l13.4184 0l0 -160l-13.4184 0Z" fill="#D85A30"></path>\n<path d="M-5 -5l210.4116 0l0 24l-210.4116 0Z" transform="translate(408.7942 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(408.7942 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(408.7942 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(471.5354 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(471.5354 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(537.5637 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(537.5637 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="10" y="406"><svg xmlns="http://www.w3.org/2000/svg" width="350" height="448"><rect width="350" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="155" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="163" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="220" y="10" width="55" height="26" fill="#f1efe8" rx="3"/><text x="228" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><rect x="275" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="283" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="330" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="163" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="228" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="283" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="340" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="330" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="163" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="228" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="283" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="340" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="330" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="163" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="228" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="283" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="340" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="330" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="163" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="228" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="283" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="340" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="330" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="163" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="228" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="283" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="340" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="330" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="163" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="228" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="283" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="340" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="330" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="163" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="228" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="283" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="340" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="330" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="163" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="228" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="283" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="340" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="330" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="163" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="228" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="283" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="340" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="330" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="163" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="228" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="283" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="340" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="330" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="163" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="228" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="283" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="340" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="330" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="163" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="228" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="283" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="340" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="330" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="163" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="228" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="283" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="340" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="330" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="163" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="228" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="283" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="340" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="330" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="163" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="228" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="283" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="340" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="330" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="163" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="228" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="283" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="340" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="330" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="163" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="228" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,566</text><text x="283" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:27:50.876193	2026-05-03 17:27:50.876193	\N
8	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar	<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="880"><rect width="1018" height="880" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="30" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M57.9988 300l19.6602 0l0 -219.4l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M117.2488 300l19.6602 0l0 -230.4l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M176.4988 300l19.6602 0l0 -232.6l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M235.7488 300l19.6602 0l0 -236.2l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M294.9988 300l19.6602 0l0 -182l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M354.2488 300l19.6602 0l0 -241.8l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M413.4988 300l19.6602 0l0 -179.2l-19.6602 0Z" fill="rgb(55,138,221)"></path>\n<path d="M472.7488 300l19.6602 0l0 -221.4l-19.6602 0Z" fill="rgb(55,138,221)"></path>\n<path d="M531.9988 300l19.6602 0l0 -225l-19.6602 0Z" fill="rgb(55,138,221)"></path>\n<path d="M591.2488 300l19.6602 0l0 -212.8l-19.6602 0Z" fill="rgb(55,138,221)"></path>\n<path d="M650.4988 300l19.6602 0l0 -158.8l-19.6602 0Z" fill="rgb(55,138,221)"></path>\n<path d="M709.7488 300l19.6602 0l0 -201.2l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M768.9988 300l19.6602 0l0 -18l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M828.2488 300l19.6602 0l0 -200l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M887.4988 300l19.6602 0l0 -180l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M946.7488 300l19.6602 0l0 -180l-19.6602 0Z" fill="#378ADD"></path>\n<path d="M81.591 300l19.6602 0l0 -6.2l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M140.841 300l19.6602 0l0 -11.6l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M200.091 300l19.6602 0l0 -4l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M259.341 300l19.6602 0l0 -3.6l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M318.591 300l19.6602 0l0 -1.4l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M377.841 300l19.6602 0l0 -14.2l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M437.091 300l19.6602 0l0 -27.2l-19.6602 0Z" fill="rgb(29,158,117)"></path>\n<path d="M496.341 300l19.6602 0l0 -2l-19.6602 0Z" fill="rgb(29,158,117)"></path>\n<path d="M555.591 300l19.6602 0l0 -1.4l-19.6602 0Z" fill="rgb(29,158,117)"></path>\n<path d="M614.841 300l19.6602 0l0 -1l-19.6602 0Z" fill="rgb(29,158,117)"></path>\n<path d="M674.091 300l19.6602 0l0 -3.2l-19.6602 0Z" fill="rgb(29,158,117)"></path>\n<path d="M733.341 300l19.6602 0l0 -5.4l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M792.591 300l19.6602 0l0 -18l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M851.841 300l19.6602 0l0 -16l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M911.091 300l19.6602 0l0 -18l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M970.341 300l19.6602 0l0 -180l-19.6602 0Z" fill="#1D9E75"></path>\n<path d="M-5 -5l128.7695 0l0 24l-128.7695 0Z" transform="translate(449.6152 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(449.6152 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(449.6152 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(512.3564 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(512.3564 341)" fill="#333">BMD</text>\n</svg></svg><svg x="10" y="406"><svg xmlns="http://www.w3.org/2000/svg" width="350" height="448"><rect width="350" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="155" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="163" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="220" y="10" width="55" height="26" fill="#f1efe8" rx="3"/><text x="228" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><rect x="275" y="10" width="65" height="26" fill="#f1efe8" rx="3"/><text x="283" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="330" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="163" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="228" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="283" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="340" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="330" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="163" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="228" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="283" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="340" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="330" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="163" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="228" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="283" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="340" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="330" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="163" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="228" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="283" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="340" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="330" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="163" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="228" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="283" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="340" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="330" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="163" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="228" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="283" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="340" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="330" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="163" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="228" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="283" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="340" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="330" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="163" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="228" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="283" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="340" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="330" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="163" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="228" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="283" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="340" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="330" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="163" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="228" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="283" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="340" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="330" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="163" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="228" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="283" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="340" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="330" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="163" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="228" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="283" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="340" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="330" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="163" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="228" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="283" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="340" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="330" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="163" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="228" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="283" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="340" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="330" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="163" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="228" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="283" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="340" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="330" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="163" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="228" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="283" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="340" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="330" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="163" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="228" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,566</text><text x="283" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:31:15.387744	2026-05-03 17:31:15.387744	\N
9	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="880"><rect width="1018" height="880" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="30" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M56.8138 300l13.4184 0l0 -170l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M116.0638 300l13.4184 0l0 -185.8l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M175.3138 300l13.4184 0l0 -153.4l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M234.5638 300l13.4184 0l0 -198.2l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M293.8138 300l13.4184 0l0 -169.8l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M353.0638 300l13.4184 0l0 -181l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M412.3138 300l13.4184 0l0 -136.8l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M471.5638 300l13.4184 0l0 -155.6l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M530.8138 300l13.4184 0l0 -155.6l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M590.0638 300l13.4184 0l0 -170.4l-13.4184 0Z" fill="rgb(55,138,221)"></path>\n<path d="M649.3138 300l13.4184 0l0 -155l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M708.5638 300l13.4184 0l0 -200.2l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M767.8138 300l13.4184 0l0 -18l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M827.0638 300l13.4184 0l0 -200l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M886.3138 300l13.4184 0l0 -180l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M945.5638 300l13.4184 0l0 -180l-13.4184 0Z" fill="#378ADD"></path>\n<path d="M72.9158 300l13.4184 0l0 -219.4l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M132.1658 300l13.4184 0l0 -230.4l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M191.4158 300l13.4184 0l0 -232.6l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M250.6658 300l13.4184 0l0 -236.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M309.9158 300l13.4184 0l0 -182l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M369.1658 300l13.4184 0l0 -241.8l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M428.4158 300l13.4184 0l0 -179.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M487.6658 300l13.4184 0l0 -221.4l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M546.9158 300l13.4184 0l0 -225l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M606.1658 300l13.4184 0l0 -212.8l-13.4184 0Z" fill="rgb(29,158,117)"></path>\n<path d="M665.4158 300l13.4184 0l0 -158.8l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M724.6658 300l13.4184 0l0 -201.2l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M783.9158 300l13.4184 0l0 -18l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M843.1658 300l13.4184 0l0 -200l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M902.4158 300l13.4184 0l0 -180l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M961.6658 300l13.4184 0l0 -180l-13.4184 0Z" fill="#1D9E75"></path>\n<path d="M89.0179 300l13.4184 0l0 -18l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M148.2679 300l13.4184 0l0 -25.8l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M207.5179 300l13.4184 0l0 -18.6l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M266.7679 300l13.4184 0l0 -16.4l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M326.0179 300l13.4184 0l0 -22.8l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M385.2679 300l13.4184 0l0 -22.2l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M444.5179 300l13.4184 0l0 -12l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M503.7679 300l13.4184 0l0 -8.4l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M563.0179 300l13.4184 0l0 -13.8l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M622.2679 300l13.4184 0l0 -12.2l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M681.5179 300l13.4184 0l0 -11.8l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M740.7679 300l13.4184 0l0 -10l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M800.0179 300l13.4184 0l0 -18l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M859.2679 300l13.4184 0l0 -18l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M918.5179 300l13.4184 0l0 -20l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M977.7679 300l13.4184 0l0 -160l-13.4184 0Z" fill="rgb(216,90,48)"></path>\n<path d="M-5 -5l212.3398 0l0 24l-212.3398 0Z" transform="translate(407.8301 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(407.8301 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(407.8301 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(475.7866 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(475.7866 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(538.5278 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(538.5278 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="10" y="406"><svg xmlns="http://www.w3.org/2000/svg" width="310" height="448"><rect width="310" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="160" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="168" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="230" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="238" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="290" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="168" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="238" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="300" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="290" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="168" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="238" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="300" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="290" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="168" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="238" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="300" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="290" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="168" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="238" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="300" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="290" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="168" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="238" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="300" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="290" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="168" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="238" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="300" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="290" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="168" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="238" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="300" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="290" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="238" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="300" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="290" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="238" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="300" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="290" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="168" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="238" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="300" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="290" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="168" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="238" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="300" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="290" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="168" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="238" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="300" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="290" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="168" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="238" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="300" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="290" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="168" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="238" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="300" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="290" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="300" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="290" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="300" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="290" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="168" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="238" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:36:20.922336	2026-05-03 17:36:20.922336	{"rows": [{"usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "ct_scan"], "totals": {"usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:06:20.895Z", "series_labels": ["X-ray", "USG", "CT Scan"]}
10	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, BMD, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1438" height="500"><rect width="1438" height="500" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="36" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M55.6288 300l10.4332 0l0 -170l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M114.8788 300l10.4332 0l0 -185.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M174.1288 300l10.4332 0l0 -153.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M233.3788 300l10.4332 0l0 -198.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M292.6288 300l10.4332 0l0 -169.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M351.8788 300l10.4332 0l0 -181l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M411.1288 300l10.4332 0l0 -136.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M470.3788 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M529.6288 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M588.8788 300l10.4332 0l0 -170.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M648.1288 300l10.4332 0l0 -155l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M707.3788 300l10.4332 0l0 -200.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M766.6288 300l10.4332 0l0 -18l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M825.8788 300l10.4332 0l0 -200l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M885.1288 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M944.3788 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M68.1485 300l10.4332 0l0 -219.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M127.3985 300l10.4332 0l0 -230.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M186.6485 300l10.4332 0l0 -232.6l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M245.8985 300l10.4332 0l0 -236.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M305.1485 300l10.4332 0l0 -182l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M364.3985 300l10.4332 0l0 -241.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M423.6485 300l10.4332 0l0 -179.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M482.8985 300l10.4332 0l0 -221.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M542.1485 300l10.4332 0l0 -225l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M601.3985 300l10.4332 0l0 -212.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M660.6485 300l10.4332 0l0 -158.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M719.8985 300l10.4332 0l0 -201.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M779.1485 300l10.4332 0l0 -18l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M838.3985 300l10.4332 0l0 -200l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M897.6485 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M956.8985 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M80.6683 300l10.4332 0l0 -6.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M139.9183 300l10.4332 0l0 -11.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M199.1683 300l10.4332 0l0 -4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M258.4183 300l10.4332 0l0 -3.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M317.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M376.9183 300l10.4332 0l0 -14.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M436.1683 300l10.4332 0l0 -27.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M495.4183 300l10.4332 0l0 -2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M554.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M613.9183 300l10.4332 0l0 -1l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M673.1683 300l10.4332 0l0 -3.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M732.4183 300l10.4332 0l0 -5.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M791.6683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M850.9183 300l10.4332 0l0 -16l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M910.1683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M969.4183 300l10.4332 0l0 -180l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M93.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M152.4381 300l10.4332 0l0 -25.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M211.6881 300l10.4332 0l0 -18.6l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M270.9381 300l10.4332 0l0 -16.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M330.1881 300l10.4332 0l0 -22.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M389.4381 300l10.4332 0l0 -22.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M448.6881 300l10.4332 0l0 -12l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M507.9381 300l10.4332 0l0 -8.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M567.1881 300l10.4332 0l0 -13.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M626.4381 300l10.4332 0l0 -12.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M685.6881 300l10.4332 0l0 -11.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M744.9381 300l10.4332 0l0 -10l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M804.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M863.4381 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M922.6881 300l10.4332 0l0 -20l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M981.9381 300l10.4332 0l0 -160l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M-5 -5l278.3682 0l0 24l-278.3682 0Z" transform="translate(374.8159 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(374.8159 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(374.8159 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(442.7725 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(442.7725 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(505.5137 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(505.5137 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(571.542 341)" fill="#BA7517"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(571.542 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="1038" y="36"><svg xmlns="http://www.w3.org/2000/svg" width="380" height="448"><rect width="380" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="160" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="168" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="230" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="238" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><rect x="300" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="308" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="360" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="168" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="238" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="308" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="370" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="360" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="168" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="238" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="308" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="370" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="360" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="168" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="238" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="308" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="370" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="360" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="168" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="238" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="308" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="370" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="360" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="168" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="238" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="370" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="360" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="168" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="238" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="308" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="370" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="360" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="168" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="238" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="308" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="370" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="360" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="238" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="308" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="370" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="360" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="238" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="370" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="360" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="168" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="238" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="308" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="370" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="360" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="168" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="238" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="308" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="370" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="360" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="168" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="238" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="308" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="370" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="360" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="168" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="238" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="370" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="360" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="168" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="238" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="308" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="370" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="360" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="370" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="360" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="308" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="370" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="360" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="168" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="238" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,566</text><text x="308" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:40:34.776712	2026-05-03 17:40:34.776712	{"rows": [{"bmd": 31, "usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"bmd": 58, "usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"bmd": 20, "usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"bmd": 18, "usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"bmd": 7, "usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"bmd": 71, "usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"bmd": 136, "usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"bmd": 10, "usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"bmd": 7, "usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"bmd": 5, "usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"bmd": 16, "usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"bmd": 27, "usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"bmd": 90, "usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"bmd": 80, "usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"bmd": 90, "usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"bmd": 900, "usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "bmd", "ct_scan"], "totals": {"bmd": 1566, "usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:10:34.770Z", "series_labels": ["X-ray", "USG", "BMD", "CT Scan"]}
11	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, BMD, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1438" height="500"><rect width="1438" height="500" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="36" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M55.6288 300l10.4332 0l0 -170l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M114.8788 300l10.4332 0l0 -185.8l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M174.1288 300l10.4332 0l0 -153.4l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M233.3788 300l10.4332 0l0 -198.2l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M292.6288 300l10.4332 0l0 -169.8l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M351.8788 300l10.4332 0l0 -181l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M411.1288 300l10.4332 0l0 -136.8l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M470.3788 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M529.6288 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M588.8788 300l10.4332 0l0 -170.4l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M648.1288 300l10.4332 0l0 -155l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M707.3788 300l10.4332 0l0 -200.2l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M766.6288 300l10.4332 0l0 -18l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M825.8788 300l10.4332 0l0 -200l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M885.1288 300l10.4332 0l0 -180l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M944.3788 300l10.4332 0l0 -180l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M68.1485 300l10.4332 0l0 -219.4l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M127.3985 300l10.4332 0l0 -230.4l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M186.6485 300l10.4332 0l0 -232.6l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M245.8985 300l10.4332 0l0 -236.2l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M305.1485 300l10.4332 0l0 -182l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M364.3985 300l10.4332 0l0 -241.8l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M423.6485 300l10.4332 0l0 -179.2l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M482.8985 300l10.4332 0l0 -221.4l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M542.1485 300l10.4332 0l0 -225l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M601.3985 300l10.4332 0l0 -212.8l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M660.6485 300l10.4332 0l0 -158.8l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M719.8985 300l10.4332 0l0 -201.2l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M779.1485 300l10.4332 0l0 -18l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M838.3985 300l10.4332 0l0 -200l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M897.6485 300l10.4332 0l0 -180l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M956.8985 300l10.4332 0l0 -180l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M80.6683 300l10.4332 0l0 -6.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M139.9183 300l10.4332 0l0 -11.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M199.1683 300l10.4332 0l0 -4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M258.4183 300l10.4332 0l0 -3.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M317.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M376.9183 300l10.4332 0l0 -14.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M436.1683 300l10.4332 0l0 -27.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M495.4183 300l10.4332 0l0 -2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M554.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M613.9183 300l10.4332 0l0 -1l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M673.1683 300l10.4332 0l0 -3.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M732.4183 300l10.4332 0l0 -5.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M791.6683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M850.9183 300l10.4332 0l0 -16l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M910.1683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M969.4183 300l10.4332 0l0 -180l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M93.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M152.4381 300l10.4332 0l0 -25.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M211.6881 300l10.4332 0l0 -18.6l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M270.9381 300l10.4332 0l0 -16.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M330.1881 300l10.4332 0l0 -22.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M389.4381 300l10.4332 0l0 -22.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M448.6881 300l10.4332 0l0 -12l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M507.9381 300l10.4332 0l0 -8.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M567.1881 300l10.4332 0l0 -13.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M626.4381 300l10.4332 0l0 -12.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M685.6881 300l10.4332 0l0 -11.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M744.9381 300l10.4332 0l0 -10l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M804.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M863.4381 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M922.6881 300l10.4332 0l0 -20l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M981.9381 300l10.4332 0l0 -160l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M-5 -5l278.3682 0l0 24l-278.3682 0Z" transform="translate(374.8159 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(374.8159 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(374.8159 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(442.7725 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(442.7725 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(505.5137 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(505.5137 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(571.542 341)" fill="#BA7517"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(571.542 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="1038" y="36"><svg xmlns="http://www.w3.org/2000/svg" width="380" height="448"><rect width="380" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="160" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="168" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="230" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="238" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><rect x="300" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="308" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="360" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="168" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="238" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="308" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="370" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="360" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="168" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="238" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="308" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="370" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="360" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="168" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="238" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="308" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="370" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="360" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="168" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="238" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="308" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="370" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="360" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="168" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="238" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="370" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="360" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="168" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="238" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="308" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="370" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="360" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="168" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="238" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="308" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="370" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="360" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="238" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="308" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="370" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="360" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="238" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="370" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="360" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="168" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="238" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="308" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="370" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="360" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="168" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="238" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="308" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="370" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="360" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="168" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="238" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="308" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="370" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="360" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="168" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="238" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="370" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="360" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="168" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="238" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="308" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="370" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="360" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="370" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="360" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="308" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="370" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="360" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="168" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="238" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,566</text><text x="308" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:42:06.679699	2026-05-03 17:42:06.679699	{"rows": [{"bmd": 31, "usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"bmd": 58, "usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"bmd": 20, "usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"bmd": 18, "usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"bmd": 7, "usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"bmd": 71, "usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"bmd": 136, "usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"bmd": 10, "usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"bmd": 7, "usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"bmd": 5, "usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"bmd": 16, "usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"bmd": 27, "usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"bmd": 90, "usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"bmd": 80, "usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"bmd": 90, "usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"bmd": 900, "usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "bmd", "ct_scan"], "totals": {"bmd": 1566, "usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:12:06.675Z", "series_labels": ["X-ray", "USG", "BMD", "CT Scan"]}
12	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, BMD, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1054" height="500"><rect width="1054" height="500" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg xmlns="http://www.w3.org/2000/svg" x="0" y="36" width="640" height="340" viewBox="0 0 1018 360" preserveAspectRatio="xMidYMid meet"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M55.6288 300l10.4332 0l0 -170l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M114.8788 300l10.4332 0l0 -185.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M174.1288 300l10.4332 0l0 -153.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M233.3788 300l10.4332 0l0 -198.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M292.6288 300l10.4332 0l0 -169.8l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M351.8788 300l10.4332 0l0 -181l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M411.1288 300l10.4332 0l0 -136.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M470.3788 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M529.6288 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M588.8788 300l10.4332 0l0 -170.4l-10.4332 0Z" fill="rgb(55,138,221)"></path>\n<path d="M648.1288 300l10.4332 0l0 -155l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M707.3788 300l10.4332 0l0 -200.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M766.6288 300l10.4332 0l0 -18l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M825.8788 300l10.4332 0l0 -200l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M885.1288 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M944.3788 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M68.1485 300l10.4332 0l0 -219.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M127.3985 300l10.4332 0l0 -230.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M186.6485 300l10.4332 0l0 -232.6l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M245.8985 300l10.4332 0l0 -236.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M305.1485 300l10.4332 0l0 -182l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M364.3985 300l10.4332 0l0 -241.8l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M423.6485 300l10.4332 0l0 -179.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M482.8985 300l10.4332 0l0 -221.4l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M542.1485 300l10.4332 0l0 -225l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M601.3985 300l10.4332 0l0 -212.8l-10.4332 0Z" fill="rgb(29,158,117)"></path>\n<path d="M660.6485 300l10.4332 0l0 -158.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M719.8985 300l10.4332 0l0 -201.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M779.1485 300l10.4332 0l0 -18l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M838.3985 300l10.4332 0l0 -200l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M897.6485 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M956.8985 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M80.6683 300l10.4332 0l0 -6.2l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M139.9183 300l10.4332 0l0 -11.6l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M199.1683 300l10.4332 0l0 -4l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M258.4183 300l10.4332 0l0 -3.6l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M317.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M376.9183 300l10.4332 0l0 -14.2l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M436.1683 300l10.4332 0l0 -27.2l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M495.4183 300l10.4332 0l0 -2l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M554.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M613.9183 300l10.4332 0l0 -1l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M673.1683 300l10.4332 0l0 -3.2l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M732.4183 300l10.4332 0l0 -5.4l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M791.6683 300l10.4332 0l0 -18l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M850.9183 300l10.4332 0l0 -16l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M910.1683 300l10.4332 0l0 -18l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M969.4183 300l10.4332 0l0 -180l-10.4332 0Z" fill="rgb(216,90,48)"></path>\n<path d="M93.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M152.4381 300l10.4332 0l0 -25.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M211.6881 300l10.4332 0l0 -18.6l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M270.9381 300l10.4332 0l0 -16.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M330.1881 300l10.4332 0l0 -22.8l-10.4332 0Z" fill="rgb(186,117,23)"></path>\n<path d="M389.4381 300l10.4332 0l0 -22.2l-10.4332 0Z" fill="rgb(186,117,23)"></path>\n<path d="M448.6881 300l10.4332 0l0 -12l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M507.9381 300l10.4332 0l0 -8.4l-10.4332 0Z" fill="rgb(186,117,23)"></path>\n<path d="M567.1881 300l10.4332 0l0 -13.8l-10.4332 0Z" fill="rgb(186,117,23)"></path>\n<path d="M626.4381 300l10.4332 0l0 -12.2l-10.4332 0Z" fill="rgb(186,117,23)"></path>\n<path d="M685.6881 300l10.4332 0l0 -11.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M744.9381 300l10.4332 0l0 -10l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M804.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M863.4381 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M922.6881 300l10.4332 0l0 -20l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M981.9381 300l10.4332 0l0 -160l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M-5 -5l278.3682 0l0 24l-278.3682 0Z" transform="translate(374.8159 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(374.8159 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(374.8159 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(442.7725 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(442.7725 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(505.5137 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(505.5137 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(571.542 341)" fill="#BA7517"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(571.542 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="664" y="36"><svg xmlns="http://www.w3.org/2000/svg" width="380" height="448"><rect width="380" height="448" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="80" height="26" fill="#f1efe8" rx="3"/><text x="18" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Period</text><rect x="90" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="98" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><rect x="160" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="168" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><rect x="230" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="238" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><rect x="300" y="10" width="70" height="26" fill="#f1efe8" rx="3"/><text x="308" y="29" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><rect x="10" y="40" width="360" height="24" fill="#ffffff"/><text x="18" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-24</text><text x="98" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="168" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="238" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="308" y="56" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="64" x2="370" y2="64" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="64" width="360" height="24" fill="#f8f8f6"/><text x="18" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-24</text><text x="98" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="168" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="238" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="308" y="80" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><line x1="10" y1="88" x2="370" y2="88" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="88" width="360" height="24" fill="#ffffff"/><text x="18" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-24</text><text x="98" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="168" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="238" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="308" y="104" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><line x1="10" y1="112" x2="370" y2="112" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="112" width="360" height="24" fill="#f8f8f6"/><text x="18" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-24</text><text x="98" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="168" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="238" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="308" y="128" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><line x1="10" y1="136" x2="370" y2="136" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="136" width="360" height="24" fill="#ffffff"/><text x="18" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Aug-24</text><text x="98" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="168" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="238" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="152" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><line x1="10" y1="160" x2="370" y2="160" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="160" width="360" height="24" fill="#f8f8f6"/><text x="18" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Sep-24</text><text x="98" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="168" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="238" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="308" y="176" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><line x1="10" y1="184" x2="370" y2="184" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="184" width="360" height="24" fill="#ffffff"/><text x="18" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Oct-24</text><text x="98" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="168" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="238" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="308" y="200" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><line x1="10" y1="208" x2="370" y2="208" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="208" width="360" height="24" fill="#f8f8f6"/><text x="18" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Nov-24</text><text x="98" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="238" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="308" y="224" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><line x1="10" y1="232" x2="370" y2="232" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="232" width="360" height="24" fill="#ffffff"/><text x="18" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Dec-24</text><text x="98" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="168" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="238" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="308" y="248" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><line x1="10" y1="256" x2="370" y2="256" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="256" width="360" height="24" fill="#f8f8f6"/><text x="18" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jan-25</text><text x="98" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="168" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="238" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="308" y="272" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><line x1="10" y1="280" x2="370" y2="280" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="280" width="360" height="24" fill="#ffffff"/><text x="18" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Feb-25</text><text x="98" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="168" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="238" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="308" y="296" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><line x1="10" y1="304" x2="370" y2="304" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="304" width="360" height="24" fill="#f8f8f6"/><text x="18" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Mar-25</text><text x="98" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="168" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="238" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="308" y="320" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><line x1="10" y1="328" x2="370" y2="328" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="328" width="360" height="24" fill="#ffffff"/><text x="18" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Apr-25</text><text x="98" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="168" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="238" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="344" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="352" x2="370" y2="352" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="352" width="360" height="24" fill="#f8f8f6"/><text x="18" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">May-25</text><text x="98" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="168" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="238" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="308" y="368" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><line x1="10" y1="376" x2="370" y2="376" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="376" width="360" height="24" fill="#ffffff"/><text x="18" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jun-25</text><text x="98" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="308" y="392" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><line x1="10" y1="400" x2="370" y2="400" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="400" width="360" height="24" fill="#f8f8f6"/><text x="18" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">Jul-25</text><text x="98" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="168" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="238" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="308" y="416" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="424" x2="370" y2="424" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="424" width="360" height="24" fill="#e6f1fb" rx="3"/><text x="18" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="98" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">13,049</text><text x="168" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">15,594</text><text x="238" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,566</text><text x="308" y="440" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,040</text></svg></svg></svg>	final	bar	2026-05-03 17:43:55.129659	2026-05-03 17:43:55.129659	{"rows": [{"bmd": 31, "usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"bmd": 58, "usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"bmd": 20, "usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"bmd": 18, "usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"bmd": 7, "usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"bmd": 71, "usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"bmd": 136, "usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"bmd": 10, "usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"bmd": 7, "usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"bmd": 5, "usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"bmd": 16, "usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"bmd": 27, "usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"bmd": 90, "usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"bmd": 80, "usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"bmd": 90, "usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"bmd": 900, "usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "bmd", "ct_scan"], "totals": {"bmd": 1566, "usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:13:55.125Z", "series_labels": ["X-ray", "USG", "BMD", "CT Scan"]}
13	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, BMD, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="610"><rect width="1018" height="610" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="36" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M55.6288 300l10.4332 0l0 -170l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M114.8788 300l10.4332 0l0 -185.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M174.1288 300l10.4332 0l0 -153.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M233.3788 300l10.4332 0l0 -198.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M292.6288 300l10.4332 0l0 -169.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M351.8788 300l10.4332 0l0 -181l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M411.1288 300l10.4332 0l0 -136.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M470.3788 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M529.6288 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M588.8788 300l10.4332 0l0 -170.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M648.1288 300l10.4332 0l0 -155l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M707.3788 300l10.4332 0l0 -200.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M766.6288 300l10.4332 0l0 -18l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M825.8788 300l10.4332 0l0 -200l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M885.1288 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M944.3788 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M68.1485 300l10.4332 0l0 -219.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M127.3985 300l10.4332 0l0 -230.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M186.6485 300l10.4332 0l0 -232.6l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M245.8985 300l10.4332 0l0 -236.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M305.1485 300l10.4332 0l0 -182l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M364.3985 300l10.4332 0l0 -241.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M423.6485 300l10.4332 0l0 -179.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M482.8985 300l10.4332 0l0 -221.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M542.1485 300l10.4332 0l0 -225l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M601.3985 300l10.4332 0l0 -212.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M660.6485 300l10.4332 0l0 -158.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M719.8985 300l10.4332 0l0 -201.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M779.1485 300l10.4332 0l0 -18l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M838.3985 300l10.4332 0l0 -200l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M897.6485 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M956.8985 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M80.6683 300l10.4332 0l0 -6.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M139.9183 300l10.4332 0l0 -11.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M199.1683 300l10.4332 0l0 -4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M258.4183 300l10.4332 0l0 -3.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M317.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M376.9183 300l10.4332 0l0 -14.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M436.1683 300l10.4332 0l0 -27.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M495.4183 300l10.4332 0l0 -2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M554.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M613.9183 300l10.4332 0l0 -1l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M673.1683 300l10.4332 0l0 -3.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M732.4183 300l10.4332 0l0 -5.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M791.6683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M850.9183 300l10.4332 0l0 -16l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M910.1683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M969.4183 300l10.4332 0l0 -180l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M93.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M152.4381 300l10.4332 0l0 -25.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M211.6881 300l10.4332 0l0 -18.6l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M270.9381 300l10.4332 0l0 -16.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M330.1881 300l10.4332 0l0 -22.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M389.4381 300l10.4332 0l0 -22.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M448.6881 300l10.4332 0l0 -12l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M507.9381 300l10.4332 0l0 -8.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M567.1881 300l10.4332 0l0 -13.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M626.4381 300l10.4332 0l0 -12.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M685.6881 300l10.4332 0l0 -11.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M744.9381 300l10.4332 0l0 -10l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M804.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M863.4381 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M922.6881 300l10.4332 0l0 -20l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M981.9381 300l10.4332 0l0 -160l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M-5 -5l278.3682 0l0 24l-278.3682 0Z" transform="translate(374.8159 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(374.8159 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(374.8159 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(442.7725 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(442.7725 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(505.5137 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(505.5137 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(571.542 341)" fill="#BA7517"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(571.542 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="32" y="412" width="954" height="182" viewBox="0 0 954 182" preserveAspectRatio="xMidYMid meet"><svg xmlns="http://www.w3.org/2000/svg" width="954" height="182"><rect width="954" height="182" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="70" height="28" fill="#f1efe8" rx="3"/><rect x="80" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="107" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Apr-24</text><rect x="134" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="161" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">May-24</text><rect x="188" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="215" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jun-24</text><rect x="242" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="269" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jul-24</text><rect x="296" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="323" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Aug-24</text><rect x="350" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="377" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Sep-24</text><rect x="404" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="431" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Oct-24</text><rect x="458" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="485" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Nov-24</text><rect x="512" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="539" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Dec-24</text><rect x="566" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="593" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jan-25</text><rect x="620" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="647" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Feb-25</text><rect x="674" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="701" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Mar-25</text><rect x="728" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="755" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Apr-25</text><rect x="782" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="809" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">May-25</text><rect x="836" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="863" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jun-25</text><rect x="890" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="917" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jul-25</text><rect x="10" y="42" width="934" height="26" fill="#ffffff"/><text x="18" y="59" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><text x="107" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="161" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="215" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="269" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="323" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="377" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="431" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="485" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="539" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="593" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="647" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="701" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="755" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="863" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="917" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="68" x2="944" y2="68" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="68" width="934" height="26" fill="#f8f8f6"/><text x="18" y="85" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><text x="107" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="161" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="215" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="269" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="323" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="377" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="431" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="485" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="539" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="593" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="647" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="701" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="755" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="863" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="917" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="94" x2="944" y2="94" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="94" width="934" height="26" fill="#ffffff"/><text x="18" y="111" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><text x="107" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="161" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="215" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="269" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="323" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="377" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="431" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="485" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="539" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="593" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="647" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="701" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="755" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="863" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="917" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="120" x2="944" y2="120" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="120" width="934" height="26" fill="#f8f8f6"/><text x="18" y="137" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><text x="107" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="161" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><text x="215" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><text x="269" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><text x="323" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><text x="377" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><text x="431" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><text x="485" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><text x="539" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><text x="593" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><text x="647" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><text x="701" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><text x="755" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="863" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><text x="917" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="146" x2="944" y2="146" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="146" width="934" height="26" fill="#e6f1fb" rx="3"/><text x="18" y="163" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="107" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,068</text><text x="161" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,268</text><text x="215" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,043</text><text x="269" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,272</text><text x="323" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,880</text><text x="377" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,296</text><text x="431" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,776</text><text x="485" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,937</text><text x="539" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,979</text><text x="593" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,982</text><text x="647" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,644</text><text x="701" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,084</text><text x="755" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">360</text><text x="809" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,170</text><text x="863" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,990</text><text x="917" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">3,500</text></svg></svg></svg>	final	bar	2026-05-03 17:46:23.747841	2026-05-03 17:46:23.747841	{"rows": [{"bmd": 31, "usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"bmd": 58, "usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"bmd": 20, "usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"bmd": 18, "usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"bmd": 7, "usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"bmd": 71, "usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"bmd": 136, "usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"bmd": 10, "usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"bmd": 7, "usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"bmd": 5, "usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"bmd": 16, "usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"bmd": 27, "usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"bmd": 90, "usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"bmd": 80, "usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"bmd": 90, "usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"bmd": 900, "usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "bmd", "ct_scan"], "totals": {"bmd": 1566, "usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:16:23.743Z", "series_labels": ["X-ray", "USG", "BMD", "CT Scan"]}
14	AIIA Radiology Tests Apr 2024 – Mar 2025	FY 2024–25 | chart: bar | series: X-ray, USG, BMD, CT Scan	<svg xmlns="http://www.w3.org/2000/svg" width="1018" height="610"><rect width="1018" height="610" fill="#ffffff"/><text x="14" y="22" font-size="13" font-weight="600" fill="#2c2c2a" font-family="system-ui,sans-serif">AIIA — Radiology Tests Apr 2024 to Mar 2025</text><svg x="0" y="36" width="1018" height="360"><svg width="1018" height="360" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 1018 360">\n<rect width="1018" height="360" x="0" y="0" id="0" fill="none"></rect>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 260.5L998 260.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 220.5L998 220.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 180.5L998 180.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 140.5L998 140.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 100.5L998 100.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 60.5L998 60.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 20.5L998 20.5" fill="none" stroke="#E0E6F1"></path>\n<path d="M50 300.5L998 300.5" fill="none" stroke="#6E7079" stroke-linecap="round"></path>\n<path d="M50.5 300L50.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M109.5 300L109.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M168.5 300L168.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M228.5 300L228.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M287.5 300L287.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M346.5 300L346.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M405.5 300L405.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M465.5 300L465.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M524.5 300L524.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M583.5 300L583.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M642.5 300L642.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M702.5 300L702.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M761.5 300L761.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M820.5 300L820.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M879.5 300L879.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M939.5 300L939.5 305" fill="none" stroke="#6E7079"></path>\n<path d="M998.5 300L998.5 305" fill="none" stroke="#6E7079"></path>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 300)" fill="#6E7079">0</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 260)" fill="#6E7079">200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 220)" fill="#6E7079">400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 180)" fill="#6E7079">600</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 140)" fill="#6E7079">800</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 100)" fill="#6E7079">1,000</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 60)" fill="#6E7079">1,200</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="translate(42 20)" fill="#6E7079">1,400</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,79.625,308)" fill="#6E7079">Apr-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,138.875,308)" fill="#6E7079">May-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,198.125,308)" fill="#6E7079">Jun-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,257.375,308)" fill="#6E7079">Jul-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,316.625,308)" fill="#6E7079">Aug-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,375.875,308)" fill="#6E7079">Sep-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,435.125,308)" fill="#6E7079">Oct-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,494.375,308)" fill="#6E7079">Nov-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,553.625,308)" fill="#6E7079">Dec-24</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,612.875,308)" fill="#6E7079">Jan-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,672.125,308)" fill="#6E7079">Feb-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,731.375,308)" fill="#6E7079">Mar-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,790.625,308)" fill="#6E7079">Apr-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,849.875,308)" fill="#6E7079">May-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,909.125,308)" fill="#6E7079">Jun-25</text>\n<text dominant-baseline="central" text-anchor="end" style="font-size:10px;font-family:Microsoft YaHei;" transform="matrix(0.866,-0.5,0.5,0.866,968.375,308)" fill="#6E7079">Jul-25</text>\n<path d="M55.6288 300l10.4332 0l0 -170l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M114.8788 300l10.4332 0l0 -185.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M174.1288 300l10.4332 0l0 -153.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M233.3788 300l10.4332 0l0 -198.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M292.6288 300l10.4332 0l0 -169.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M351.8788 300l10.4332 0l0 -181l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M411.1288 300l10.4332 0l0 -136.8l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M470.3788 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M529.6288 300l10.4332 0l0 -155.6l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M588.8788 300l10.4332 0l0 -170.4l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M648.1288 300l10.4332 0l0 -155l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M707.3788 300l10.4332 0l0 -200.2l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M766.6288 300l10.4332 0l0 -18l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M825.8788 300l10.4332 0l0 -200l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M885.1288 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M944.3788 300l10.4332 0l0 -180l-10.4332 0Z" fill="#378ADD"></path>\n<path d="M68.1485 300l10.4332 0l0 -219.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M127.3985 300l10.4332 0l0 -230.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M186.6485 300l10.4332 0l0 -232.6l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M245.8985 300l10.4332 0l0 -236.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M305.1485 300l10.4332 0l0 -182l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M364.3985 300l10.4332 0l0 -241.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M423.6485 300l10.4332 0l0 -179.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M482.8985 300l10.4332 0l0 -221.4l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M542.1485 300l10.4332 0l0 -225l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M601.3985 300l10.4332 0l0 -212.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M660.6485 300l10.4332 0l0 -158.8l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M719.8985 300l10.4332 0l0 -201.2l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M779.1485 300l10.4332 0l0 -18l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M838.3985 300l10.4332 0l0 -200l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M897.6485 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M956.8985 300l10.4332 0l0 -180l-10.4332 0Z" fill="#1D9E75"></path>\n<path d="M80.6683 300l10.4332 0l0 -6.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M139.9183 300l10.4332 0l0 -11.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M199.1683 300l10.4332 0l0 -4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M258.4183 300l10.4332 0l0 -3.6l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M317.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M376.9183 300l10.4332 0l0 -14.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M436.1683 300l10.4332 0l0 -27.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M495.4183 300l10.4332 0l0 -2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M554.6683 300l10.4332 0l0 -1.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M613.9183 300l10.4332 0l0 -1l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M673.1683 300l10.4332 0l0 -3.2l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M732.4183 300l10.4332 0l0 -5.4l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M791.6683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M850.9183 300l10.4332 0l0 -16l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M910.1683 300l10.4332 0l0 -18l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M969.4183 300l10.4332 0l0 -180l-10.4332 0Z" fill="#D85A30"></path>\n<path d="M93.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M152.4381 300l10.4332 0l0 -25.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M211.6881 300l10.4332 0l0 -18.6l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M270.9381 300l10.4332 0l0 -16.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M330.1881 300l10.4332 0l0 -22.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M389.4381 300l10.4332 0l0 -22.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M448.6881 300l10.4332 0l0 -12l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M507.9381 300l10.4332 0l0 -8.4l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M567.1881 300l10.4332 0l0 -13.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M626.4381 300l10.4332 0l0 -12.2l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M685.6881 300l10.4332 0l0 -11.8l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M744.9381 300l10.4332 0l0 -10l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M804.1881 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M863.4381 300l10.4332 0l0 -18l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M922.6881 300l10.4332 0l0 -20l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M981.9381 300l10.4332 0l0 -160l-10.4332 0Z" fill="#BA7517"></path>\n<path d="M-5 -5l278.3682 0l0 24l-278.3682 0Z" transform="translate(374.8159 341)" fill="rgb(0,0,0)" fill-opacity="0" stroke="#ccc" stroke-width="0"></path>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(374.8159 341)" fill="#378ADD"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(374.8159 341)" fill="#333">X-ray</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(442.7725 341)" fill="#1D9E75"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(442.7725 341)" fill="#333">USG</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(505.5137 341)" fill="#D85A30"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" x="30" y="7" transform="translate(505.5137 341)" fill="#333">BMD</text>\n<path d="M3.5 0L21.5 0A3.5 3.5 0 0 1 25 3.5L25 10.5A3.5 3.5 0 0 1 21.5 14L3.5 14A3.5 3.5 0 0 1 0 10.5L0 3.5A3.5 3.5 0 0 1 3.5 0" transform="translate(571.542 341)" fill="#BA7517"></path>\n<text dominant-baseline="central" text-anchor="start" style="font-size:11px;font-family:Microsoft YaHei;" xml:space="preserve" x="30" y="7" transform="translate(571.542 341)" fill="#333">CT Scan</text>\n</svg></svg><svg x="32" y="412" width="954" height="182" viewBox="0 0 954 182" preserveAspectRatio="xMidYMid meet"><svg xmlns="http://www.w3.org/2000/svg" width="954" height="182"><rect width="954" height="182" fill="#ffffff" rx="6" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="10" width="70" height="28" fill="#f1efe8" rx="3"/><rect x="80" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="107" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Apr-24</text><rect x="134" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="161" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">May-24</text><rect x="188" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="215" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jun-24</text><rect x="242" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="269" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jul-24</text><rect x="296" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="323" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Aug-24</text><rect x="350" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="377" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Sep-24</text><rect x="404" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="431" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Oct-24</text><rect x="458" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="485" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Nov-24</text><rect x="512" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="539" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Dec-24</text><rect x="566" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="593" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jan-25</text><rect x="620" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="647" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Feb-25</text><rect x="674" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="701" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Mar-25</text><rect x="728" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="755" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Apr-25</text><rect x="782" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="809" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">May-25</text><rect x="836" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="863" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jun-25</text><rect x="890" y="10" width="52" height="28" fill="#f1efe8" rx="3"/><text x="917" y="30" text-anchor="middle" font-size="10" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">Jul-25</text><rect x="10" y="42" width="934" height="26" fill="#ffffff"/><text x="18" y="59" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">X-ray</text><text x="107" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">850</text><text x="161" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">929</text><text x="215" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">767</text><text x="269" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">991</text><text x="323" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">849</text><text x="377" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">905</text><text x="431" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">684</text><text x="485" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="539" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">778</text><text x="593" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">852</text><text x="647" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">775</text><text x="701" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,001</text><text x="755" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="863" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="917" y="59" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="68" x2="944" y2="68" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="68" width="934" height="26" fill="#f8f8f6"/><text x="18" y="85" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">USG</text><text x="107" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,097</text><text x="161" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,152</text><text x="215" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,163</text><text x="269" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,181</text><text x="323" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">910</text><text x="377" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,209</text><text x="431" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">896</text><text x="485" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,107</text><text x="539" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,125</text><text x="593" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,064</text><text x="647" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">794</text><text x="701" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,006</text><text x="755" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">1,000</text><text x="863" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><text x="917" y="85" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="94" x2="944" y2="94" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="94" width="934" height="26" fill="#ffffff"/><text x="18" y="111" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">BMD</text><text x="107" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">31</text><text x="161" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">58</text><text x="215" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">20</text><text x="269" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">18</text><text x="323" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="377" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">71</text><text x="431" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">136</text><text x="485" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">10</text><text x="539" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">7</text><text x="593" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">5</text><text x="647" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">16</text><text x="701" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">27</text><text x="755" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">80</text><text x="863" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="917" y="111" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">900</text><line x1="10" y1="120" x2="944" y2="120" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="120" width="934" height="26" fill="#f8f8f6"/><text x="18" y="137" font-size="11" font-weight="600" fill="#5f5e5a" font-family="system-ui,sans-serif">CT Scan</text><text x="107" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="161" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">129</text><text x="215" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">93</text><text x="269" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">82</text><text x="323" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">114</text><text x="377" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">111</text><text x="431" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">60</text><text x="485" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">42</text><text x="539" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">69</text><text x="593" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">61</text><text x="647" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">59</text><text x="701" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">50</text><text x="755" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="809" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">90</text><text x="863" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">100</text><text x="917" y="137" text-anchor="middle" font-size="11" fill="#2c2c2a" font-family="system-ui,sans-serif">800</text><line x1="10" y1="146" x2="944" y2="146" stroke="#e2e0d8" stroke-width="0.5"/><rect x="10" y="146" width="934" height="26" fill="#e6f1fb" rx="3"/><text x="18" y="163" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">Total</text><text x="107" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,068</text><text x="161" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,268</text><text x="215" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,043</text><text x="269" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,272</text><text x="323" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,880</text><text x="377" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,296</text><text x="431" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,776</text><text x="485" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,937</text><text x="539" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,979</text><text x="593" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,982</text><text x="647" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,644</text><text x="701" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,084</text><text x="755" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">360</text><text x="809" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">2,170</text><text x="863" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">1,990</text><text x="917" y="163" text-anchor="middle" font-size="11" font-weight="600" fill="#185fa5" font-family="system-ui,sans-serif">3,500</text></svg></svg></svg>	final	bar	2026-05-03 17:58:16.875277	2026-05-03 17:58:16.875277	{"rows": [{"bmd": 31, "usg": 1097, "x_ray": 850, "period": "Apr-24", "ct_scan": 90}, {"bmd": 58, "usg": 1152, "x_ray": 929, "period": "May-24", "ct_scan": 129}, {"bmd": 20, "usg": 1163, "x_ray": 767, "period": "Jun-24", "ct_scan": 93}, {"bmd": 18, "usg": 1181, "x_ray": 991, "period": "Jul-24", "ct_scan": 82}, {"bmd": 7, "usg": 910, "x_ray": 849, "period": "Aug-24", "ct_scan": 114}, {"bmd": 71, "usg": 1209, "x_ray": 905, "period": "Sep-24", "ct_scan": 111}, {"bmd": 136, "usg": 896, "x_ray": 684, "period": "Oct-24", "ct_scan": 60}, {"bmd": 10, "usg": 1107, "x_ray": 778, "period": "Nov-24", "ct_scan": 42}, {"bmd": 7, "usg": 1125, "x_ray": 778, "period": "Dec-24", "ct_scan": 69}, {"bmd": 5, "usg": 1064, "x_ray": 852, "period": "Jan-25", "ct_scan": 61}, {"bmd": 16, "usg": 794, "x_ray": 775, "period": "Feb-25", "ct_scan": 59}, {"bmd": 27, "usg": 1006, "x_ray": 1001, "period": "Mar-25", "ct_scan": 50}, {"bmd": 90, "usg": 90, "x_ray": 90, "period": "Apr-25", "ct_scan": 90}, {"bmd": 80, "usg": 1000, "x_ray": 1000, "period": "May-25", "ct_scan": 90}, {"bmd": 90, "usg": 900, "x_ray": 900, "period": "Jun-25", "ct_scan": 100}, {"bmd": 900, "usg": 900, "x_ray": 900, "period": "Jul-25", "ct_scan": 800}], "series": ["x_ray", "usg", "bmd", "ct_scan"], "totals": {"bmd": 1566, "usg": 15594, "x_ray": 13049, "ct_scan": 2040}, "periods": ["Apr-24", "May-24", "Jun-24", "Jul-24", "Aug-24", "Sep-24", "Oct-24", "Nov-24", "Dec-24", "Jan-25", "Feb-25", "Mar-25", "Apr-25", "May-25", "Jun-25", "Jul-25"], "chart_type": "bar", "generated_at": "2026-05-03T12:28:16.869Z", "series_labels": ["X-ray", "USG", "BMD", "CT Scan"]}
\.


--
-- TOC entry 5217 (class 0 OID 145351)
-- Dependencies: 234
-- Data for Name: table_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.table_list (id, form_name, institute_access, share_table, created_by, updated_by, created_at, updated_at) FROM stdin;
570ceace-38ef-48af-941a-ef8f0737ee21	tester_rohit	{9e2eb6f7-aa57-4262-bb28-a526c7e0511b}	f	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	2026-05-07 23:07:47.945685+05:30	2026-05-07 23:07:47.945685+05:30
080e3c38-1c10-4497-abb1-7533cde51497	heheh	{9e2eb6f7-aa57-4262-bb28-a526c7e0511b}	f	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	2026-05-07 23:09:47.116984+05:30	2026-05-07 23:09:47.116984+05:30
fdddb566-20fb-4176-bded-61f9fb60e720	heheh2	{9e2eb6f7-aa57-4262-bb28-a526c7e0511b}	f	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	2026-05-07 23:12:38.192666+05:30	2026-05-07 23:12:38.192666+05:30
cdc69b37-12bd-47b6-93e4-bab16d036243	erfa	{9e2eb6f7-aa57-4262-bb28-a526c7e0511b}	f	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	2026-05-07 23:39:57.255831+05:30	2026-05-07 23:39:57.255831+05:30
8ca576da-caad-415b-9bc5-cf473b82026d	teseter2	{aaaaaaaa-0000-0000-0000-000000000001}	f	24841969-f268-4e31-b939-7e1ce508c627	\N	2026-05-13 22:46:05.601119+05:30	2026-05-13 22:46:05.601119+05:30
17710ff5-21b2-4ab2-a439-ccb29d114ff1	abcdef	{9e2eb6f7-aa57-4262-bb28-a526c7e0511b}	t	1503c19f-8972-40b5-aa27-877daf8d82e0	\N	2026-05-20 23:05:22.016802+05:30	2026-05-20 23:05:22.016802+05:30
\.


--
-- TOC entry 5224 (class 0 OID 145447)
-- Dependencies: 241
-- Data for Name: teseter2_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teseter2_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, a, h, bb, fss) FROM stdin;
262c2195-7537-4416-8256-120b21794000	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	60a160f3-d126-47d2-bdc7-148389b98504	\N	\N	\N	en	2026-05-13 23:45:05.421331+05:30	2026-05-13 23:45:35.383192+05:30	\N	testingg	http://localhost:5000/uploads/documents/cc255808-02f3-4070-a382-a39e00a5236c.jpg	\N
14619060-661c-4e5c-a062-250c50dcfab6	teseter2	aaaaaaaa-0000-0000-0000-000000000001	2026	55f3a875-b8c9-4679-806f-88fd5c7c2ea2	\N	\N	\N	en	2026-05-13 23:51:43.028042+05:30	2026-05-13 23:51:43.028042+05:30	\N	\N	http://localhost:5000/uploads/documents/ef032997-4291-4c4b-8801-3e25fd463a5d.png	\N
\.


--
-- TOC entry 5220 (class 0 OID 145407)
-- Dependencies: 237
-- Data for Name: tester_rohit_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tester_rohit_records (id, form_name, institution_id, year, schema_id, status, order_index, custom_fields, language, created_at, updated_at, helloman, java) FROM stdin;
223faf03-c8dd-496c-805e-021899f72188	tester_rohit	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	2c0128c8-6212-4ad9-800f-a3aa26c8795d	\N	\N	\N	en	2026-05-07 23:24:56.51445+05:30	2026-05-07 23:24:56.51445+05:30	testerr	https://www.youtube.com/
cab1b41a-25bc-47d6-90f3-2fb574e8906d	tester_rohit	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2026	2c0128c8-6212-4ad9-800f-a3aa26c8795d	\N	\N	\N	en	2026-05-07 23:30:59.417736+05:30	2026-05-07 23:35:45.989309+05:30	fgsgs	http://localhost:5000/uploads/documents/26faa668-488e-49dc-93f9-a51bb330cd33.pdf
\.


--
-- TOC entry 5215 (class 0 OID 145182)
-- Dependencies: 232
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (id, user_id, role_id, assigned_by, assigned_at, expires_at, revoked_at) FROM stdin;
ae5743b1-7d24-437f-995c-4ce3a976d269	cccccccc-0000-0000-0000-000000000001	1228e7ec-3a62-42ec-8f41-a4ccf957e40f	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
45f85037-60dc-4dc3-b1fc-f92096e7449a	cccccccc-0000-0000-0000-000000000002	eb21df23-350b-449d-bec8-37395c85107e	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
786614f6-917d-4b66-a4fd-ee76bf93f4e2	cccccccc-0000-0000-0000-000000000003	bd86bc4f-e04e-456a-9370-683e34521671	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
0c767882-10d6-44ae-ab22-5365db3cd2cf	cccccccc-0000-0000-0000-000000000004	c3dbd707-7286-4863-870b-f55195f9c70f	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
3f06e416-5d20-454f-93f1-e57fd9c71958	cccccccc-0000-0000-0000-000000000005	2aebfd43-49c6-4026-8869-ee20fbf5aa50	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
40a30165-3750-4dc1-b69d-de459854dc2c	cccccccc-0000-0000-0000-000000000003	c29dcf81-6d8f-4f7f-a2ac-85bd7b7b012b	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	\N	\N
1ff1c3de-2fb5-4304-a23c-a53a8e3c71e3	cecbe436-155a-464b-a329-961d899ad22a	ae958c00-cf08-47b6-b802-faefbebf2c53	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:25:12.202594+05:30	\N	\N
459dcabb-b2e0-4ffc-9ab9-8f4f66cea9f7	c9573cbf-a1bc-4142-a1b4-e56bcc61d345	ca2aee76-a1ee-487f-a8df-de0690a34e01	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:26:19.374442+05:30	\N	\N
37cc767d-27e0-4095-8ba2-3691ef7d09a8	b9868910-2180-4658-9517-0ed0022856b4	ae958c00-cf08-47b6-b802-faefbebf2c53	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:34:44.577134+05:30	\N	\N
d50d2542-146c-4e3f-b65c-70ff62b4ec85	272eeb9f-7415-4287-bc36-217d8c1776ed	1228e7ec-3a62-42ec-8f41-a4ccf957e40f	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:07:43.210405+05:30	\N	\N
994e0344-0b13-4df1-b76b-88568b053e36	d6d4a853-ec3f-4c28-ad42-0a585783475c	1228e7ec-3a62-42ec-8f41-a4ccf957e40f	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:32:03.015032+05:30	\N	\N
fb73d1e8-3774-424a-bdf0-2b23c1b2e7b7	e94cb1fe-7049-4d62-a269-24206459157c	1228e7ec-3a62-42ec-8f41-a4ccf957e40f	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:33:54.880594+05:30	\N	\N
80510f35-2447-419d-ac58-96f7ee4f4552	7f9e874e-1fb0-4ba9-b933-6a3d8adacee8	ca2aee76-a1ee-487f-a8df-de0690a34e01	7f9e874e-1fb0-4ba9-b933-6a3d8adacee8	2026-05-01 00:49:19.351853+05:30	\N	\N
99613616-93ef-4e22-bdea-b4e48b629d3f	99b9192d-1342-4883-b9a7-5fb701da5180	eb21df23-350b-449d-bec8-37395c85107e	99b9192d-1342-4883-b9a7-5fb701da5180	2026-04-26 12:53:55.258571+05:30	\N	2026-04-26 13:24:02.74112+05:30
89b752a7-7cc2-4ee0-8ea5-836c6213c682	99b9192d-1342-4883-b9a7-5fb701da5180	1228e7ec-3a62-42ec-8f41-a4ccf957e40f	99b9192d-1342-4883-b9a7-5fb701da5180	2026-04-26 13:24:16.321316+05:30	\N	\N
9e1716ca-327a-4df8-bda5-56fa8c4f25ef	c9a6db66-340f-425e-8fbc-7d1b3abc21db	eb21df23-350b-449d-bec8-37395c85107e	c9a6db66-340f-425e-8fbc-7d1b3abc21db	2026-04-26 16:08:52.761031+05:30	\N	\N
d9f52ac6-f8bb-4588-bbc1-6dfe667d5e49	89f764b2-568e-490a-932b-f80da9a89530	eb21df23-350b-449d-bec8-37395c85107e	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-02 20:13:24.511307+05:30	\N	\N
46343118-9f59-4572-b865-640c3da2f034	c66edadb-093a-4783-8206-b06550a42564	c3dbd707-7286-4863-870b-f55195f9c70f	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.466392+05:30	\N	\N
4982d104-8ed8-45f4-8d7b-ac7edf025503	3f558e3a-c34d-4b9c-9948-3ad7262ec819	c3dbd707-7286-4863-870b-f55195f9c70f	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.466392+05:30	\N	\N
728cbf68-1806-4e46-9b3f-5612c4886cbb	a9a7f5bb-d9da-4233-b05a-c62fd6585468	c3dbd707-7286-4863-870b-f55195f9c70f	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.466392+05:30	\N	\N
60399bbe-0a6d-490a-ad52-4781e6f8d45f	1503c19f-8972-40b5-aa27-877daf8d82e0	eb21df23-350b-449d-bec8-37395c85107e	cccccccc-0000-0000-0000-000000000001	2026-05-06 23:12:05.628566+05:30	\N	\N
e5d0e64e-b58c-4423-8dfa-9184aa565a44	20facbff-eae7-4a80-9ee4-1311bab2b2da	d631d5fd-0366-4358-82fb-2cc8535d7193	cccccccc-0000-0000-0000-000000000001	2026-05-07 23:22:22.561734+05:30	\N	\N
94f1731f-8ee7-435a-89fd-a1645187eb19	24841969-f268-4e31-b939-7e1ce508c627	eb21df23-350b-449d-bec8-37395c85107e	cccccccc-0000-0000-0000-000000000001	2026-05-13 22:43:28.437111+05:30	\N	\N
\.


--
-- TOC entry 5216 (class 0 OID 145187)
-- Dependencies: 233
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, institution_id, department_id, full_name, email, password_hash, profile_image_url, must_change_password, last_login_at, password_changed_at, account_status, created_by, created_at, token_version, is_temporary_password) FROM stdin;
cecbe436-155a-464b-a329-961d899ad22a	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000003	User1	user1@gmail.com	$2b$10$AxGKjQW0tAa5mhGOOoeWaeVMdgYaXMLXH2YBd5MuPe8h1PF4EgrsK	\N	t	2026-04-26 00:29:01.665465+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:25:12.184983+05:30	1	f
cccccccc-0000-0000-0000-000000000002	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000003	Anitha K	anitha@aiia.edu.in	$2a$10$NFo7ACCaqeNvGhLpiAJGmuS8bzNyjVzTAzqsLlJDW/A4/csWnsRV.	\N	t	2026-04-26 00:39:34.944267+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	1	f
cccccccc-0000-0000-0000-000000000005	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000002	Mohan T	mohan@aiia.edu.in	$2a$10$oD0lWgRbO0fNCPXtT4RcwuiOWdfGHhXjhcxj3IxONs3uNDPa5jwQK	\N	t	2026-04-26 00:05:54.067022+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	1	f
cccccccc-0000-0000-0000-000000000003	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000003	Ravi Kumar	ravi@aiia.edu.in	$2a$10$x7Mzs2O3GqDeEjwEfflU8.ijt1UcdVuv5AmzUvrrHMeAQ4ff9n0B6	\N	t	\N	\N	INACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	1	f
c9573cbf-a1bc-4142-a1b4-e56bcc61d345	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000002	User2	user2@gmail.com	$2b$10$ipJ2U9HvAir4SrB/wAYWMeT3XBHpATdv.5i0R1RSv.ymppNpC7P8i	\N	t	\N	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:26:19.373231+05:30	1	f
272eeb9f-7415-4287-bc36-217d8c1776ed	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000001	diva	diva@aiia.edu.in	$2b$10$R0Z4f4u1VSJiQTSFl.QvdeIZkYqk0YvTXkWQuHXaB0mxTjn5FJCpG	\N	t	2026-04-26 01:07:53.621455+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:07:43.198585+05:30	1	f
b9868910-2180-4658-9517-0ed0022856b4	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000001	divakarg@aiia.edu.in	divakarg@aiia.edu.in	$2b$10$e2JDd6wMEHWM2Db.uNzhT.//s//N9wdSESYBrpQX21nMwKervKdMe	\N	t	2026-04-26 01:29:12.838454+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 00:34:44.567636+05:30	2	f
e94cb1fe-7049-4d62-a269-24206459157c	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000001	divakar	divakar@aaaiia.edu.in	$2b$10$ODWEF2CbwS6YD/M6swblTuhaiFqwovAowFWRmbic2gtzi2zwsimoK	\N	t	2026-04-26 01:34:26.868143+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:33:54.87118+05:30	1	f
d6d4a853-ec3f-4c28-ad42-0a585783475c	\N	\N	Arun	arun@gmail.com	$2b$12$3k4/Yjn.i6gXOuUooXfkVezh.NKgETE0l91JX4apK2grfzYYd3HkS	\N	t	2026-04-26 01:32:17.224407+05:30	\N	INACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-26 01:32:03.004723+05:30	2	f
7f9e874e-1fb0-4ba9-b933-6a3d8adacee8	aaaaaaaa-0000-0000-0000-000000000001	\N	Moulini	mouli@aiia.edu.in	$2b$10$FhomFMJrVPpwKXlFL9EILuyfLtR8V1HQM3RLLvqFB6IYv2aWpAANq	\N	f	2026-05-05 21:45:12.765254+05:30	\N	ACTIVE	\N	2026-05-01 00:47:27.34025+05:30	1	f
99b9192d-1342-4883-b9a7-5fb701da5180	aaaaaaaa-0000-0000-0000-000000000001	\N	moul	moul@aiia.edu.in	$2b$10$1R1Z9CjcKLVh4Wv0uNo8puy220QKRqX/ZsOKEXstHAGnRodAWOirm	\N	f	2026-05-05 22:05:35.914664+05:30	\N	ACTIVE	\N	2026-04-26 12:53:24.028144+05:30	1	f
c66edadb-093a-4783-8206-b06550a42564	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	Arun Kumar	arun@example.com	$2b$10$7qrPzC.jPVpgdca/SAaX3OgX2zjSDW70NmWd7WdeRx4o/HMwY7P6u	\N	t	\N	\N	ACTIVE	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.451601+05:30	1	t
6348b38a-4f6b-455b-b83f-2b1480a6a064	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	Priya Singh	priya@example.com	$2b$10$0vmojN/w6MZreIykBXTc.OaMDjwTnZATFnyQmpnqz/WMRxMAOjZZG	\N	t	\N	\N	ACTIVE	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.451601+05:30	1	t
3f558e3a-c34d-4b9c-9948-3ad7262ec819	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	Vikram Nair	vikram@example.com	$2b$10$iDhfJwa5KnY.ekddgTqqiOE2LMz4GgB4k.Tvq1G4OKrSHGx8EPVIi	\N	t	\N	\N	ACTIVE	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.451601+05:30	1	t
a9a7f5bb-d9da-4233-b05a-c62fd6585468	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	Moulini	moul@edu.in	$2b$10$HveGsJ.y.fVwJlZ1f/rWLO49RYVfpXQEq.xVvmSPc.JevCIkXth9y	\N	t	\N	\N	ACTIVE	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-05 22:07:10.451601+05:30	1	t
89f764b2-568e-490a-932b-f80da9a89530	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	2c123037-ba6a-4922-8786-2c51a647ac90	Moulini	moulinisrinivasan@gmail.com	$2b$12$pf4uxfB4/1finGLU.zX0Nu7qL3cVtZTSwbCrHD9gfjmJzCLHTVN4K	\N	f	2026-05-03 22:08:59.862333+05:30	\N	ACTIVE	99b9192d-1342-4883-b9a7-5fb701da5180	2026-05-02 20:13:24.478959+05:30	1	f
cccccccc-0000-0000-0000-000000000004	aaaaaaaa-0000-0000-0000-000000000001	bbbbbbbb-0000-0000-0000-000000000001	Priya S	priya@aiia.edu.in	$2b$10$6p7aYYMJ4a/dtKoegYOKLeEaZSFspzquvT8s26eV2xVV574WauK/O	true	f	2026-04-26 12:45:05.703364+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-04-25 21:26:07.007605+05:30	1	f
c9a6db66-340f-425e-8fbc-7d1b3abc21db	aaaaaaaa-0000-0000-0000-000000000001	\N	Institute Admin	admin@aiia.edu.in	$2b$10$FhomFMJrVPpwKXlFL9EILuyfLtR8V1HQM3RLLvqFB6IYv2aWpAANq	true	f	2026-05-03 13:54:14.995704+05:30	\N	ACTIVE	\N	2026-04-26 16:08:44.367844+05:30	1	f
20facbff-eae7-4a80-9ee4-1311bab2b2da	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	dAdmin	dadmin@aiia.edu.in	$2b$12$VbJ1y4Vkf3wvX0QVrWPrjOmdsAEmr4qYtFd81N2lDD4fxN78iVy4C	\N	f	2026-05-20 23:07:04.872876+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-05-07 23:22:22.55384+05:30	1	f
24841969-f268-4e31-b939-7e1ce508c627	aaaaaaaa-0000-0000-0000-000000000001	\N	admin2	iadmin2@aiia.edu.in	$2b$12$f6y3yFQycd2E1INOoHfidOelrM2GHqU/s5irn.WtATZ2puwz1W7La	\N	f	2026-05-13 23:56:09.014777+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-05-13 22:43:28.404058+05:30	1	f
1503c19f-8972-40b5-aa27-877daf8d82e0	9e2eb6f7-aa57-4262-bb28-a526c7e0511b	\N	iAdmin1	iadmin@aiia.edu.in	$2b$12$FuU0pcbSCv1qfoOAzzL3weLmkqxYTQjt7.yumvZiS/qA32Iju4rLu	\N	f	2026-05-20 23:23:53.927561+05:30	\N	ACTIVE	cccccccc-0000-0000-0000-000000000001	2026-05-06 23:12:05.619183+05:30	1	f
cccccccc-0000-0000-0000-000000000001	aaaaaaaa-0000-0000-0000-000000000001	\N	Divakar R	divakar@aiia.edu.in	$2a$10$ElVuWI0hD0UIl5v0qygDFuQ/B0vHB0RdQgBg7WxdXmOKcDBayb6nK	\N	f	2026-05-20 23:06:23.464708+05:30	\N	ACTIVE	\N	2026-04-25 21:26:07.007605+05:30	2	f
\.


--
-- TOC entry 5235 (class 0 OID 0)
-- Dependencies: 222
-- Name: management_committees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.management_committees_id_seq', 1, false);


--
-- TOC entry 5236 (class 0 OID 0)
-- Dependencies: 223
-- Name: management_committees_id_seq1; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.management_committees_id_seq1', 1, false);


--
-- TOC entry 5237 (class 0 OID 0)
-- Dependencies: 227
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 12, true);


--
-- TOC entry 5238 (class 0 OID 0)
-- Dependencies: 231
-- Name: svg_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.svg_reports_id_seq', 14, true);


--
-- TOC entry 5037 (class 2606 OID 153676)
-- Name: abcdef_records abcdef_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abcdef_records
    ADD CONSTRAINT abcdef_records_pkey PRIMARY KEY (id);


--
-- TOC entry 4961 (class 2606 OID 145210)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: custom_field_schemas custom_field_schemas_form_institution_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_schemas
    ADD CONSTRAINT custom_field_schemas_form_institution_year_key UNIQUE (form_name, institution_id, year);


--
-- TOC entry 5025 (class 2606 OID 145391)
-- Name: custom_field_schemas custom_field_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_schemas
    ADD CONSTRAINT custom_field_schemas_pkey PRIMARY KEY (id);


--
-- TOC entry 4971 (class 2606 OID 145212)
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (department_id);


--
-- TOC entry 5033 (class 2606 OID 145446)
-- Name: erfa_records erfa_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.erfa_records
    ADD CONSTRAINT erfa_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5017 (class 2606 OID 145375)
-- Name: form_lock_config form_lock_config_form_name_institution_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_form_name_institution_id_key UNIQUE (form_name, institution_id);


--
-- TOC entry 5019 (class 2606 OID 145373)
-- Name: form_lock_config form_lock_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_pkey PRIMARY KEY (id);


--
-- TOC entry 5031 (class 2606 OID 145436)
-- Name: heheh2_records heheh2_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.heheh2_records
    ADD CONSTRAINT heheh2_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5029 (class 2606 OID 145426)
-- Name: heheh_records heheh_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.heheh_records
    ADD CONSTRAINT heheh_records_pkey PRIMARY KEY (id);


--
-- TOC entry 4975 (class 2606 OID 145214)
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (institution_id);


--
-- TOC entry 4982 (class 2606 OID 145216)
-- Name: management_committees management_committees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.management_committees
    ADD CONSTRAINT management_committees_pkey PRIMARY KEY (id);


--
-- TOC entry 4984 (class 2606 OID 145218)
-- Name: medical_reports medical_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medical_reports
    ADD CONSTRAINT medical_reports_pkey PRIMARY KEY (period);


--
-- TOC entry 4986 (class 2606 OID 145220)
-- Name: notification_templates notification_templates_event_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_event_id_key UNIQUE (event_id);


--
-- TOC entry 4988 (class 2606 OID 145222)
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 4991 (class 2606 OID 145224)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4993 (class 2606 OID 145226)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 4998 (class 2606 OID 145228)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5000 (class 2606 OID 145230)
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 5002 (class 2606 OID 145232)
-- Name: svg_reports svg_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.svg_reports
    ADD CONSTRAINT svg_reports_pkey PRIMARY KEY (id);


--
-- TOC entry 5013 (class 2606 OID 145362)
-- Name: table_list table_list_form_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_list
    ADD CONSTRAINT table_list_form_name_key UNIQUE (form_name);


--
-- TOC entry 5015 (class 2606 OID 145360)
-- Name: table_list table_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_list
    ADD CONSTRAINT table_list_pkey PRIMARY KEY (id);


--
-- TOC entry 5035 (class 2606 OID 145456)
-- Name: teseter2_records teseter2_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teseter2_records
    ADD CONSTRAINT teseter2_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5027 (class 2606 OID 145416)
-- Name: tester_rohit_records tester_rohit_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tester_rohit_records
    ADD CONSTRAINT tester_rohit_records_pkey PRIMARY KEY (id);


--
-- TOC entry 5006 (class 2606 OID 145234)
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5011 (class 2606 OID 145236)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4962 (class 1259 OID 145237)
-- Name: idx_audit_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- TOC entry 4963 (class 1259 OID 145238)
-- Name: idx_audit_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity_type ON public.audit_logs USING btree (entity_type);


--
-- TOC entry 4964 (class 1259 OID 145239)
-- Name: idx_audit_entity_type_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity_type_created_at ON public.audit_logs USING btree (entity_type, created_at DESC);


--
-- TOC entry 4965 (class 1259 OID 145240)
-- Name: idx_audit_ip_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_ip_address ON public.audit_logs USING btree (ip_address);


--
-- TOC entry 4966 (class 1259 OID 145241)
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- TOC entry 4967 (class 1259 OID 145242)
-- Name: idx_audit_logs_role_events; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_role_events ON public.audit_logs USING btree (entity_type, entity_id, created_at DESC) WHERE (entity_type = 'ROLE'::text);


--
-- TOC entry 4968 (class 1259 OID 145243)
-- Name: idx_audit_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_session_id ON public.audit_logs USING btree (session_id);


--
-- TOC entry 4969 (class 1259 OID 145244)
-- Name: idx_audit_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_user_id ON public.audit_logs USING btree (user_id);


--
-- TOC entry 4978 (class 1259 OID 145245)
-- Name: idx_mc_institute_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_institute_year ON public.management_committees USING btree (institute_id, finance_year);


--
-- TOC entry 4979 (class 1259 OID 145246)
-- Name: idx_mc_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_status ON public.management_committees USING btree (status);


--
-- TOC entry 4980 (class 1259 OID 145247)
-- Name: idx_mc_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_type ON public.management_committees USING btree (committee_type);


--
-- TOC entry 4989 (class 1259 OID 145248)
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- TOC entry 4994 (class 1259 OID 145249)
-- Name: idx_sessions_prev_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_prev_hash ON public.sessions USING btree (previous_token_hash) WHERE (previous_token_hash IS NOT NULL);


--
-- TOC entry 4995 (class 1259 OID 145250)
-- Name: idx_sessions_token_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);


--
-- TOC entry 4996 (class 1259 OID 145251)
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- TOC entry 5003 (class 1259 OID 145252)
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5007 (class 1259 OID 145253)
-- Name: idx_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_department ON public.users USING btree (department_id);


--
-- TOC entry 5008 (class 1259 OID 145254)
-- Name: idx_users_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_institution ON public.users USING btree (institution_id);


--
-- TOC entry 4972 (class 1259 OID 145255)
-- Name: uq_dept_code_per_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_dept_code_per_institution ON public.departments USING btree (institution_id, lower(code));


--
-- TOC entry 4973 (class 1259 OID 145256)
-- Name: uq_dept_name_per_institution; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_dept_name_per_institution ON public.departments USING btree (institution_id, lower(name));


--
-- TOC entry 4976 (class 1259 OID 145257)
-- Name: uq_institution_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_institution_code ON public.institutions USING btree (lower(code));


--
-- TOC entry 4977 (class 1259 OID 145258)
-- Name: uq_institution_email_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_institution_email_domain ON public.institutions USING btree (lower(email_domain));


--
-- TOC entry 5004 (class 1259 OID 145259)
-- Name: uq_user_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_user_role ON public.user_roles USING btree (user_id, role_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 5009 (class 1259 OID 145260)
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (institution_id, lower(email)) WHERE (account_status = 'ACTIVE'::public.user_status);


--
-- TOC entry 5055 (class 2620 OID 145261)
-- Name: notifications trg_trim_notifications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_trim_notifications AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trim_user_notifications();


--
-- TOC entry 5038 (class 2606 OID 145262)
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5054 (class 2606 OID 145396)
-- Name: custom_field_schemas custom_field_schemas_form_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_field_schemas
    ADD CONSTRAINT custom_field_schemas_form_name_fkey FOREIGN KEY (form_name) REFERENCES public.table_list(form_name);


--
-- TOC entry 5039 (class 2606 OID 145267)
-- Name: departments departments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id);


--
-- TOC entry 5040 (class 2606 OID 145272)
-- Name: departments fk_departments_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5041 (class 2606 OID 145277)
-- Name: departments fk_departments_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 5042 (class 2606 OID 145282)
-- Name: institutions fk_institutions_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT fk_institutions_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5043 (class 2606 OID 145287)
-- Name: institutions fk_institutions_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT fk_institutions_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 5050 (class 2606 OID 145292)
-- Name: users fk_users_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5051 (class 2606 OID 145297)
-- Name: users fk_users_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- TOC entry 5052 (class 2606 OID 145302)
-- Name: users fk_users_institution; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(institution_id);


--
-- TOC entry 5053 (class 2606 OID 145376)
-- Name: form_lock_config form_lock_config_form_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_lock_config
    ADD CONSTRAINT form_lock_config_form_name_fkey FOREIGN KEY (form_name) REFERENCES public.table_list(form_name);


--
-- TOC entry 5044 (class 2606 OID 145307)
-- Name: notification_templates notification_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5045 (class 2606 OID 145312)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5046 (class 2606 OID 145317)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5047 (class 2606 OID 145322)
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- TOC entry 5048 (class 2606 OID 145327)
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- TOC entry 5049 (class 2606 OID 145332)
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


-- Completed on 2026-05-21 22:19:36

--
-- PostgreSQL database dump complete
--

