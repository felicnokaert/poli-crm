-- Bandeja del equipo: roster de vendedores (editable: se suman y se van), reglas de reparto
-- y estado/asignación compartida por conversación. El CRM no envía mensajes: solo organiza.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text check (email is null or email = lower(btrim(email))),
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists team_members_email_idx on public.team_members (email) where email is not null;

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('canal','palabra')),
  value text not null,
  member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists routing_rules_member_idx on public.routing_rules (member_id);

create table if not exists public.conversation_assignments (
  conversation_key text primary key,
  channel text not null,
  customer_wa_id text not null,
  customer_name text not null default '',
  member_id uuid references public.team_members(id) on delete set null,
  status text not null default 'pendiente' check (status in ('pendiente','respondida','derivada','cerrada')),
  note text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists conversation_assignments_member_idx on public.conversation_assignments (member_id);

alter table public.team_members enable row level security;
alter table public.routing_rules enable row level security;
alter table public.conversation_assignments enable row level security;
revoke all on public.team_members, public.routing_rules, public.conversation_assignments from anon;
grant select, insert, update, delete on public.team_members, public.routing_rules, public.conversation_assignments to authenticated;

create policy team_members_read on public.team_members for select to authenticated using (public.is_poliplast_crm_user());
create policy team_members_admin on public.team_members for all to authenticated using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());
create policy routing_rules_read on public.routing_rules for select to authenticated using (public.is_poliplast_crm_user());
create policy routing_rules_admin on public.routing_rules for all to authenticated using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());
create policy conversation_assignments_read on public.conversation_assignments for select to authenticated using (public.is_poliplast_crm_user());
create policy conversation_assignments_write on public.conversation_assignments for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());

insert into public.team_members (name, email, role) values
  ('Felipe', 'felipe@grupopoliplast.com.ar', 'admin'),
  ('Yuliani', null, 'vendedor'),
  ('Brenda', null, 'vendedor'),
  ('Ezequiel', null, 'vendedor'),
  ('Juan', 'juan@grupopoliplast.com.ar', 'vendedor'),
  ('David', null, 'vendedor')
on conflict do nothing;

insert into public.routing_rules (kind, value, member_id)
select 'canal', 'juan', id from public.team_members where email = 'juan@grupopoliplast.com.ar'
and not exists (select 1 from public.routing_rules where kind = 'canal' and value = 'juan');
