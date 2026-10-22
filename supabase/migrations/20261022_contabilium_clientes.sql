-- 22/10 (OK de Felipe): copia de solo lectura de las fichas de clientes de Contabilium (CUIT, teléfono, mail,
-- ciudad) para emparejar los comprobantes con la cartera del CRM por CUIT o teléfono y no solo por nombre.
-- Escribe solo la clave de servicio (api/admin-users.js); las cuentas del CRM leen.
create table if not exists public.contabilium_clientes (
  company text not null,
  id text not null,
  razon_social text,
  cuit text,          -- solo dígitos
  telefono text,
  email text,
  ciudad text,
  provincia text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (company, id)
);
create index if not exists contabilium_clientes_cuit on public.contabilium_clientes (cuit);
alter table public.contabilium_clientes enable row level security;
create policy contabilium_clientes_read on public.contabilium_clientes for select to authenticated using (public.is_poliplast_crm_user());
