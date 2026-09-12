-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Origen: docs/ONLINE_DATA_MODEL.sql (commit 73e4722, 2026-08-28 12:07:19 -0300,
-- "add portable backups and online-ready data model").
-- Esquema inicial de Supabase para Poliplast Sales Copilot.
-- Ejecutar una sola vez en un proyecto nuevo y privado.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type text,
  industry text,
  fit text,
  potential text,
  current_supplier text,
  decision_maker text,
  loss_reason text,
  repurchase_trigger text,
  repurchase_date date,
  pipeline_stage text not null default 'Nuevo',
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text,
  role text,
  phone text,
  email text,
  consent_status text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  scores jsonb not null,
  total integer not null check (total between 0 and 28),
  band text not null,
  feedback jsonb not null,
  evaluator_type text not null,
  evaluated_at timestamptz not null default now()
);

create table quick_reply_templates (
  id uuid primary key default gen_random_uuid(),
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

create table copilot_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"clients":[],"interactions":[],"tasks":[],"inbox":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seguridad: el piloto online queda limitado al correo confirmado de Felipe.
-- La service role del webhook no se expone al navegador y omite RLS por diseño.
alter table accounts enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table tasks enable row level security;
alter table evaluations enable row level security;
alter table quick_reply_templates enable row level security;
alter table whatsapp_events enable row level security;
alter table copilot_states enable row level security;

revoke all on accounts, contacts, conversations, tasks, evaluations, quick_reply_templates, whatsapp_events, copilot_states from anon;
grant select, insert, update, delete on accounts, contacts, conversations, tasks, evaluations, quick_reply_templates, copilot_states to authenticated;
grant select on whatsapp_events to authenticated;

create policy "Felipe opera cuentas" on accounts for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe opera contactos" on contacts for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe opera conversaciones" on conversations for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe opera tareas" on tasks for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe opera evaluaciones" on evaluations for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe opera respuestas" on quick_reply_templates for all to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe lee eventos" on whatsapp_events for select to authenticated using (lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');
create policy "Felipe sincroniza su estado" on copilot_states for all to authenticated using (auth.uid() = user_id and lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com') with check (auth.uid() = user_id and lower(auth.jwt() ->> 'email') = 'felipecnokaert@gmail.com');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_events'
  ) then
    alter publication supabase_realtime add table whatsapp_events;
  end if;
end $$;
