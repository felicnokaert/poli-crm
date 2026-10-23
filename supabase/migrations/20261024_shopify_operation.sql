-- 24/10: Shopify operación. Peso y política de stock de cada variante, pedidos (sin datos del comprador) y carritos abandonados.
alter table public.shopify_variants add column if not exists inventory_policy text not null default '';
alter table public.shopify_variants add column if not exists weight_grams integer;
create table if not exists public.shopify_orders (
  id text primary key,
  name text not null default '',
  created_at timestamptz not null,
  cancelled boolean not null default false,
  test boolean not null default false,
  financial_status text not null default '',
  fulfillment_status text not null default '',
  delivery text not null default '',
  total numeric,
  currency text not null default '',
  synced_at timestamptz not null default now()
);
create index if not exists shopify_orders_created on public.shopify_orders (created_at desc);
create table if not exists public.shopify_checkouts (
  id text primary key,
  created_at timestamptz not null,
  completed boolean not null default false,
  total numeric,
  currency text not null default '',
  items jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists shopify_checkouts_created on public.shopify_checkouts (created_at desc);
alter table public.shopify_orders enable row level security;
alter table public.shopify_checkouts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopify_orders' and policyname = 'shopify_orders_read') then
    create policy shopify_orders_read on public.shopify_orders for select to authenticated using (public.is_poliplast_crm_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopify_checkouts' and policyname = 'shopify_checkouts_read') then
    create policy shopify_checkouts_read on public.shopify_checkouts for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
