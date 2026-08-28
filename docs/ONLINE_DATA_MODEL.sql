-- Esquema de referencia para la futura base online.
-- No ejecutar todavía: requiere definir proveedor, autenticación y políticas de acceso.

create table accounts (
  id uuid primary key,
  name text not null,
  client_type text,
  industry text,
  fit text,
  potential text,
  pipeline_stage text not null default 'Nuevo',
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key,
  account_id uuid not null references accounts(id),
  name text,
  role text,
  phone text,
  email text,
  consent_status text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key,
  account_id uuid not null references accounts(id),
  contact_id uuid references contacts(id),
  channel text not null,
  channel_profile text,
  summary text,
  need text,
  family text,
  objection text,
  temperature text,
  urgency text,
  raw_excerpt text,
  occurred_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key,
  account_id uuid references accounts(id),
  conversation_id uuid references conversations(id),
  title text not null,
  due_at timestamptz,
  cadence text,
  priority text,
  status text not null default 'pending',
  owner_id uuid,
  created_at timestamptz not null default now()
);

create table evaluations (
  id uuid primary key,
  conversation_id uuid not null references conversations(id),
  scores jsonb not null,
  total integer not null check (total between 0 and 28),
  band text not null,
  feedback jsonb not null,
  evaluator_type text not null,
  evaluated_at timestamptz not null default now()
);

create table quick_reply_templates (
  id uuid primary key,
  channel text not null,
  title text not null,
  guidance text not null,
  body text,
  requires_technical_validation boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table whatsapp_events (
  event_id text primary key,
  phone_number_id text not null,
  display_phone_number text,
  channel text not null,
  direction text not null,
  customer_wa_id text,
  customer_name text,
  message_type text,
  text_body text,
  occurred_at timestamptz not null,
  classification_status text not null default 'pending',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index whatsapp_events_pending_idx
  on whatsapp_events (classification_status, occurred_at desc);
