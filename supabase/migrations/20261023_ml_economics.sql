-- 23/10: ganancia y reposición por publicación de Mercado Libre (lib/ml-economics.mjs). Ventas, comisión y
-- envío los escribe el servidor (clave de servicio); el costo por unidad lo carga Felipe desde el CRM (también
-- vía api/admin-users.js). El equipo lee.
create table if not exists public.ml_item_economics (
  id text primary key,
  seller_id text not null default '',
  units_30d integer not null default 0,
  revenue_30d numeric not null default 0,
  fees_30d numeric not null default 0,
  last_shipment_id text not null default '',
  last_shipment_units integer,
  shipping_per_unit numeric,
  shipping_checked_at timestamptz,
  unit_cost numeric,
  cost_note text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists ml_item_economics_seller on public.ml_item_economics (seller_id);
alter table public.ml_item_economics enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ml_item_economics' and policyname = 'ml_item_economics_read') then
    create policy ml_item_economics_read on public.ml_item_economics for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
