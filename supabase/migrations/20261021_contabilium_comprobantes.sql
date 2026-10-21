-- Contabilium (21/10, OK de Felipe): copia de solo lectura de los comprobantes de las 3 empresas y la
-- "memoria" de hasta dónde llegó la sincronización. Escribe solo la clave de servicio (api/admin-users.js);
-- las cuentas del CRM leen.
create table if not exists public.contabilium_sync (
  company text primary key,
  cursor_date date,            -- próximo día a pedir (el historial avanza de a tramos hacia hoy)
  window_days integer,         -- largo del tramo en curso (se achica si un tramo trae demasiados)
  page integer,                -- página del tramo en curso
  history_done boolean not null default false,
  total_saved integer not null default 0,
  last_run_at timestamptz,
  last_error text
);
alter table public.contabilium_sync enable row level security;
create policy contabilium_sync_read on public.contabilium_sync for select to authenticated using (public.is_poliplast_crm_user());

create table if not exists public.contabilium_comprobantes (
  company text not null,
  id text not null,
  tipo text,
  numero text,
  fecha date,
  cliente_id text,
  cliente text,
  total numeric,
  saldo numeric,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (company, id)
);
create index if not exists contabilium_comprobantes_fecha on public.contabilium_comprobantes (company, fecha);
alter table public.contabilium_comprobantes enable row level security;
create policy contabilium_comprobantes_read on public.contabilium_comprobantes for select to authenticated using (public.is_poliplast_crm_user());
