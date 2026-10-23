# SQL pendiente: competencia por catálogo (23/10)

Se puede correr las veces que haga falta (si ya existe, no hace nada). No borra ni cambia nada.

1. supabase.com → proyecto nghwmtccpovrdtzvllwe → **SQL Editor** → **New query**.
2. Pegá todo el bloque y tocá **Run**. Tiene que decir "Success. No rows returned".
3. En el CRM: Canales online → Mercado Libre → Mercado → Competencia → **Traer competencia del catálogo**.

```sql
-- 23/10: competencia por catálogo de Mercado Libre (lib/ml-catalog.mjs). Por cada publicación nuestra de catálogo:
-- si ganamos, compartimos o perdemos, el precio para ganar, quién gana y la oferta más barata de otro vendedor.
-- Escribe solo la clave de servicio; el equipo lee. Se puede correr varias veces.
create table if not exists public.ml_catalog_status (
  item_id text primary key,
  seller_id text not null default '',
  product_id text not null default '',
  product_name text not null default '',
  permalink text not null default '',
  thumbnail text not null default '',
  our_price numeric,
  status text not null default '',
  price_to_win numeric,
  visit_share text not null default '',
  competitors_sharing integer,
  winner_item_id text not null default '',
  winner_price numeric,
  winner_seller_id text not null default '',
  winner_nickname text not null default '',
  winner_is_ours boolean,
  offers_count integer,
  others_count integer,
  cheapest_price numeric,
  cheapest_seller_id text not null default '',
  boosts jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.ml_catalog_status enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ml_catalog_status' and policyname = 'ml_catalog_status_read') then
    create policy ml_catalog_status_read on public.ml_catalog_status for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
```
