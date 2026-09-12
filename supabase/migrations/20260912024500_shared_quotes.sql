-- Cotizaciones compartidas del cotizador comercial.
-- Aditiva, sin borrado físico y con snapshots para preservar el documento emitido.

create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  owner_id uuid not null default auth.uid() references auth.users(id),
  client_name text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  payment_method text not null check (payment_method in ('transferencia','contado','cuenta_corriente','tarjeta')),
  price_mode text not null check (price_mode in ('automatico','consumidor_final','mayorista')),
  valid_days integer not null check (valid_days between 1 and 90),
  discount_percent numeric(7,4) not null default 0 check (discount_percent between 0 and 100),
  surcharge_percent numeric(7,4) not null default 0 check (surcharge_percent >= 0),
  exchange_rate numeric(18,6) not null default 1 check (exchange_rate > 0),
  output_currency text not null check (output_currency in ('USD','ARS')),
  status text not null default 'borrador' check (status in ('borrador','enviada','aceptada','rechazada')),
  issued_at timestamptz not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  line_key text not null,
  variant_id uuid references public.catalog_variants(id) on delete restrict,
  product_id uuid references public.catalog_products(id) on delete restrict,
  product_name text not null,
  sku text not null,
  brand text not null,
  family text not null,
  unit text not null,
  quantity numeric(18,6) not null check (quantity > 0),
  unit_amount numeric(18,6),
  currency text check (currency in ('USD','ARS')),
  vat_rate numeric(7,6) check (vat_rate >= 0),
  price_source text,
  commercial_rule_id uuid references public.commercial_rules(id) on delete restrict,
  line_snapshot jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sales_quote_items_quote_line_key_uq
on public.sales_quote_items(quote_id, line_key);

create index if not exists sales_quotes_updated_at_idx on public.sales_quotes(updated_at desc);
create index if not exists sales_quote_items_quote_id_idx on public.sales_quote_items(quote_id) where active;

alter table public.sales_quotes enable row level security;
alter table public.sales_quote_items enable row level security;
revoke all on public.sales_quotes, public.sales_quote_items from anon;
grant select, insert, update on public.sales_quotes, public.sales_quote_items to authenticated;
revoke delete on public.sales_quotes, public.sales_quote_items from authenticated;

drop policy if exists "Equipo lee cotizaciones" on public.sales_quotes;
create policy "Equipo lee cotizaciones" on public.sales_quotes for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Equipo crea cotizaciones" on public.sales_quotes;
create policy "Equipo crea cotizaciones" on public.sales_quotes for insert to authenticated
with check (public.is_poliplast_crm_user() and owner_id = auth.uid() and updated_by = auth.uid());
drop policy if exists "Equipo actualiza cotizaciones" on public.sales_quotes;
create policy "Equipo actualiza cotizaciones" on public.sales_quotes for update to authenticated
using (public.is_poliplast_crm_user())
with check (public.is_poliplast_crm_user() and updated_by = auth.uid());

drop policy if exists "Equipo lee renglones" on public.sales_quote_items;
create policy "Equipo lee renglones" on public.sales_quote_items for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Equipo crea renglones" on public.sales_quote_items;
create policy "Equipo crea renglones" on public.sales_quote_items for insert to authenticated
with check (public.is_poliplast_crm_user());
drop policy if exists "Equipo actualiza renglones" on public.sales_quote_items;
create policy "Equipo actualiza renglones" on public.sales_quote_items for update to authenticated
using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
