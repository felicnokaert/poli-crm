-- 27/11 (ranking de productos, pedido de Felipe): renglones de los comprobantes de Contabilium. La búsqueda
-- /api/comprobantes/search trae Items = null, así que el servidor pide cada comprobante de venta (FC, COT, NC, NCT)
-- por su id y guarda acá sus renglones. Solo lectura de Contabilium. Escribe solo la clave de servicio; leen las
-- cuentas del CRM. Se puede correr varias veces.
create table if not exists public.contabilium_items (
  company text not null,
  comprobante_id text not null,
  linea int not null,
  fecha date,
  tipo text,
  signo int not null default 1,   -- +1 FC/COT, -1 NC/NCT
  codigo text,                    -- SKU / código del concepto, en mayúsculas sin espacios
  nombre text,
  cantidad numeric,
  neto numeric,                   -- importe sin IVA del renglón (positivo; el signo va aparte)
  rubro text,
  subrubro text,
  synced_at timestamptz not null default now(),
  primary key (company, comprobante_id, linea)
);
create index if not exists contabilium_items_fecha on public.contabilium_items (fecha);
create index if not exists contabilium_items_codigo on public.contabilium_items (codigo);
alter table public.contabilium_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contabilium_items' and policyname = 'contabilium_items_read') then
    create policy contabilium_items_read on public.contabilium_items for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;

-- Qué comprobantes ya se leyeron (aunque no tengan renglones), para no pedirlos de nuevo.
create table if not exists public.contabilium_items_seen (
  company text not null,
  comprobante_id text not null,
  fetched_at timestamptz not null default now(),
  items int not null default 0,
  error text,
  primary key (company, comprobante_id)
);
alter table public.contabilium_items_seen enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contabilium_items_seen' and policyname = 'contabilium_items_seen_read') then
    create policy contabilium_items_seen_read on public.contabilium_items_seen for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
