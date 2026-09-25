-- Marca de "corrio el mantenimiento diario" que solo puede escribir el
-- servidor. Antes el aviso del Inicio leia workspace_states.data.dailySignals.
-- calculatedAt, pero cada usuario guarda TODO su `data` desde el navegador
-- (saveOnlineState hace upsert del jsonb completo), asi que una pestaña abierta
-- con un estado viejo podia pisar esa marca y disparar un aviso falso de
-- "no corrio hace 7 dias" aunque el cron hubiera corrido todos los dias
-- (los backups diarios del 15 al 24/09 lo prueban).
--
-- Sin policies de insert/update/delete a proposito: solo la service role key
-- (cron-daily-maintenance.js) escribe, y bypassea RLS. Los usuarios del CRM
-- solo pueden leer.
create table if not exists public.crm_system_status (
  key text primary key,
  last_run_at timestamptz not null,
  ok boolean not null default true,
  detail jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crm_system_status enable row level security;

drop policy if exists crm_system_status_select on public.crm_system_status;
create policy crm_system_status_select on public.crm_system_status
  for select to authenticated
  using (public.is_poliplast_crm_user());
