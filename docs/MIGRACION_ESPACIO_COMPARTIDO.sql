-- Estado comercial compartido por todo el equipo autenticado de Grupo Poliplast.

create table if not exists public.workspace_states (
  workspace_key text primary key,
  data jsonb not null default '{"clients":[],"interactions":[],"tasks":[],"inbox":[]}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text,
  updated_at timestamptz not null default now()
);

alter table public.workspace_states enable row level security;
revoke all on public.workspace_states from anon;
grant select, insert, update on public.workspace_states to authenticated;

drop policy if exists "Equipo Poliplast comparte estado" on public.workspace_states;
create policy "Equipo Poliplast comparte estado" on public.workspace_states
for all to authenticated
using (workspace_key = 'grupo-poliplast' and public.is_poliplast_crm_user())
with check (workspace_key = 'grupo-poliplast' and public.is_poliplast_crm_user());

insert into public.workspace_states (workspace_key, data, updated_by, updated_by_email, updated_at)
select
  'grupo-poliplast',
  data,
  user_id,
  (select email from auth.users where id = copilot_states.user_id),
  updated_at
from public.copilot_states
order by updated_at desc
limit 1
on conflict (workspace_key) do nothing;

insert into public.workspace_states (workspace_key)
values ('grupo-poliplast')
on conflict (workspace_key) do nothing;

