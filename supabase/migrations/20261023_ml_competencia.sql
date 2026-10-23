-- 23/10: seguimiento de la competencia y tendencias de Mercado Libre (lib/ml-competition.mjs). Escribe solo
-- la clave de servicio (Felipe carga desde el CRM vía api/admin-users.js); el equipo lee.
create table if not exists public.ml_competitor_items (
  id text primary key,
  seller_id text not null default '',
  seller_nickname text not null default '',
  competitor_name text not null default '',
  our_item_id text not null default '',
  title text not null default '',
  permalink text not null default '',
  price numeric,
  original_price numeric,
  currency text not null default '',
  sold_quantity integer,
  available_quantity integer,
  status text not null default '',
  thumbnail text not null default '',
  category_id text not null default '',
  free_shipping boolean,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  checked_at timestamptz not null default now()
);
create table if not exists public.ml_competitor_snapshots (
  item_id text not null,
  taken_on date not null,
  price numeric,
  sold_quantity integer,
  available_quantity integer,
  status text not null default '',
  primary key (item_id, taken_on)
);
create table if not exists public.ml_trends (
  category_id text not null,
  taken_on date not null,
  category_name text not null default '',
  path text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  primary key (category_id, taken_on)
);
alter table public.ml_competitor_items enable row level security;
alter table public.ml_competitor_snapshots enable row level security;
alter table public.ml_trends enable row level security;
create policy ml_competitor_items_read on public.ml_competitor_items for select to authenticated using (public.is_poliplast_crm_user());
create policy ml_competitor_snapshots_read on public.ml_competitor_snapshots for select to authenticated using (public.is_poliplast_crm_user());
create policy ml_trends_read on public.ml_trends for select to authenticated using (public.is_poliplast_crm_user());
