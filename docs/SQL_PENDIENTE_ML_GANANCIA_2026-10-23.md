# SQL pendiente: stock y ganancia de Mercado Libre (23/10)

El de las 3 tablas anteriores (docs/SQL_PENDIENTE_2026-10-23.md) ya lo corrió Felipe. Este es uno nuevo, chico:

1. supabase.com → proyecto nghwmtccpovrdtzvllwe → **SQL Editor** → **New query**.
2. Pegá el bloque y tocá **Run**.
3. En el CRM: Ventas → Mercado Libre → Resumen → **Actualizar métricas** (calcula ventas, comisión y envío por publicación).

Qué hace: crea `ml_item_economics` (ventas de 30 días, comisión y envío por publicación; el costo por unidad lo cargás vos). No borra ni cambia nada existente.

```sql
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
create policy ml_item_economics_read on public.ml_item_economics for select to authenticated using (public.is_poliplast_crm_user());
```
