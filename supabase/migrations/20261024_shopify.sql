-- 24/10: espejo de solo lectura de la tienda Shopify (lib/shopify.mjs). Lo escribe solo el servidor (clave de servicio);
-- el equipo lo lee. Productos, variantes y pedidos por día (sin datos de clientes).
create table if not exists public.shopify_products (
  id text primary key,
  title text not null default '',
  handle text not null default '',
  status text not null default '',
  vendor text not null default '',
  product_type text not null default '',
  tags text not null default '',
  description_length integer not null default 0,
  seo_title text not null default '',
  seo_description text not null default '',
  image_url text not null default '',
  media_count integer not null default 0,
  total_inventory integer,
  variants_count integer not null default 0,
  online_url text not null default '',
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists public.shopify_variants (
  id text primary key,
  product_id text not null,
  title text not null default '',
  sku text not null default '',
  barcode text not null default '',
  price numeric,
  compare_at_price numeric,
  inventory_quantity integer,
  options jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists shopify_variants_product on public.shopify_variants (product_id);
create index if not exists shopify_variants_sku on public.shopify_variants (sku);
create table if not exists public.shopify_daily (
  day date primary key,
  orders integer not null default 0,
  amount numeric not null default 0,
  currency text not null default '',
  synced_at timestamptz not null default now()
);
alter table public.shopify_products enable row level security;
alter table public.shopify_variants enable row level security;
alter table public.shopify_daily enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'shopify_products' and policyname = 'shopify_products_read') then
    create policy shopify_products_read on public.shopify_products for select to authenticated using (public.is_poliplast_crm_user());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopify_variants' and policyname = 'shopify_variants_read') then
    create policy shopify_variants_read on public.shopify_variants for select to authenticated using (public.is_poliplast_crm_user());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopify_daily' and policyname = 'shopify_daily_read') then
    create policy shopify_daily_read on public.shopify_daily for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
