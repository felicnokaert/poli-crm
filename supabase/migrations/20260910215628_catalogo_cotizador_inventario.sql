-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Origen: docs/MIGRACION_CATALOGO_COTIZADOR_INVENTARIO.sql (commit 60488a1,
-- 2026-09-10 18:07:49 -0300, "feat: prepare shared catalog and inventory
-- schema"). Corresponde a la migración registrada en el proyecto remoto como
-- "catalogo_cotizador_inventario" (versión 20260910215628).
-- Ver también docs/ADR-002-CATALOGO_PRECIOS_INVENTARIO_COMPARTIDOS.md.
--
-- Catálogo, precios e inventario compartidos para el cotizador y el contador.
-- Migración aditiva. No importa datos ni modifica el CRM actual.
-- Dependencias: MIGRACION_ACCESO_CORPORATIVO.sql y MIGRACION_BASE_TECNICA.sql.

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  name text not null,
  brand text not null default 'Grupo Poliplast',
  family text not null,
  subfamily text not null default '',
  status text not null default 'vigente' check (status in ('vigente', 'excluido', 'pendiente_revision')),
  source text not null default 'Catalogo Maestro v12',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  sku text not null,
  name text not null,
  unit text not null default 'unidad',
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  source text not null default 'Catalogo Maestro v12',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_variants_sku_not_blank check (btrim(sku) <> '')
);

create unique index if not exists catalog_variants_sku_normalized_uidx
  on public.catalog_variants (upper(btrim(sku)));
create index if not exists catalog_products_family_idx on public.catalog_products (family, subfamily);
create index if not exists catalog_variants_product_idx on public.catalog_variants (product_id);

create table if not exists public.catalog_cost_revisions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.catalog_variants(id) on delete restrict,
  amount numeric(18,6) not null check (amount >= 0),
  currency text not null check (currency in ('ARS', 'USD')),
  valid_from date not null,
  valid_until date,
  source text not null,
  status text not null default 'confirmado' check (status in ('pendiente', 'confirmado', 'vencido', 'excepcion_manual')),
  override_reason text not null default '',
  import_job_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint catalog_cost_validity check (valid_until is null or valid_until >= valid_from),
  constraint catalog_cost_override_reason check (status <> 'excepcion_manual' or btrim(override_reason) <> '')
);

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null default 'Grupo Poliplast',
  currency text not null check (currency in ('ARS', 'USD')),
  vat_rate numeric(8,6) check (vat_rate is null or vat_rate between 0 and 1),
  valid_from date not null,
  valid_until date,
  source text not null,
  status text not null default 'borrador' check (status in ('borrador', 'vigente', 'vencida')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_list_validity check (valid_until is null or valid_until >= valid_from)
);

create table if not exists public.variant_prices (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete restrict,
  variant_id uuid not null references public.catalog_variants(id) on delete restrict,
  min_quantity numeric(18,6) not null default 1 check (min_quantity > 0),
  max_quantity numeric(18,6),
  amount numeric(18,6) not null check (amount >= 0),
  calculation_mode text check (calculation_mode is null or calculation_mode in ('manual', 'markup', 'margin')),
  requested_rate numeric(12,8),
  status text not null default 'confirmado' check (status in ('pendiente', 'confirmado', 'vencido', 'excepcion_manual')),
  override_reason text not null default '',
  import_job_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint variant_price_range check (max_quantity is null or max_quantity >= min_quantity),
  constraint variant_price_override_reason check (status <> 'excepcion_manual' or btrim(override_reason) <> ''),
  unique (price_list_id, variant_id, min_quantity)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'abierto' check (status in ('abierto', 'en_revision', 'aprobado', 'anulado')),
  counted_by uuid references auth.users(id) on delete set null,
  counted_by_email text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_by_email text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  notes text not null default '',
  constraint approved_count_has_approver check (
    status <> 'aprobado' or (approved_by is not null and approved_at is not null)
  )
);

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  variant_id uuid not null references public.catalog_variants(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity >= 0),
  unit text not null,
  counted_at timestamptz not null default now(),
  unique (count_id, variant_id)
);

create table if not exists public.inventory_balances (
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  variant_id uuid not null references public.catalog_variants(id) on delete restrict,
  approved_quantity numeric(18,6) not null check (approved_quantity >= 0),
  unit text not null,
  count_id uuid not null references public.inventory_counts(id) on delete restrict,
  approved_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (location_id, variant_id)
);

create table if not exists public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  import_type text not null check (import_type in ('catalogo', 'costos', 'precios', 'stock', 'documentos')),
  file_name text not null,
  file_sha256 text not null,
  status text not null default 'vista_previa' check (status in ('vista_previa', 'rechazado', 'aplicado', 'revertido')),
  summary jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  imported_by_email text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id) on delete set null,
  reverted_by_email text
);

create table if not exists public.catalog_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.catalog_import_jobs(id) on delete restrict,
  row_number integer not null check (row_number > 0),
  sku text,
  classification text not null check (classification in ('alta', 'cambio', 'sin_cambio', 'conflicto', 'error')),
  errors jsonb not null default '[]'::jsonb,
  incoming_data jsonb not null default '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (import_job_id, row_number)
);

alter table public.catalog_cost_revisions
  drop constraint if exists catalog_cost_revisions_import_job_id_fkey;
alter table public.catalog_cost_revisions
  add constraint catalog_cost_revisions_import_job_id_fkey
  foreign key (import_job_id) references public.catalog_import_jobs(id) on delete restrict;

alter table public.variant_prices
  drop constraint if exists variant_prices_import_job_id_fkey;
alter table public.variant_prices
  add constraint variant_prices_import_job_id_fkey
  foreign key (import_job_id) references public.catalog_import_jobs(id) on delete restrict;

create index if not exists catalog_cost_variant_date_idx on public.catalog_cost_revisions (variant_id, valid_from desc);
create index if not exists variant_prices_variant_idx on public.variant_prices (variant_id, price_list_id);
create index if not exists inventory_count_lines_variant_idx on public.inventory_count_lines (variant_id);
create index if not exists inventory_balances_variant_idx on public.inventory_balances (variant_id);
create index if not exists catalog_import_rows_job_idx on public.catalog_import_rows (import_job_id, classification);

alter table public.catalog_products enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.catalog_cost_revisions enable row level security;
alter table public.price_lists enable row level security;
alter table public.variant_prices enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.catalog_import_jobs enable row level security;
alter table public.catalog_import_rows enable row level security;

revoke all on public.catalog_products, public.catalog_variants, public.catalog_cost_revisions,
  public.price_lists, public.variant_prices, public.inventory_locations, public.inventory_counts,
  public.inventory_count_lines, public.inventory_balances, public.catalog_import_jobs,
  public.catalog_import_rows from anon;

grant select on public.catalog_products, public.catalog_variants, public.price_lists,
  public.variant_prices, public.inventory_locations, public.inventory_counts,
  public.inventory_count_lines, public.inventory_balances to authenticated;
grant select, insert, update on public.catalog_products, public.catalog_variants,
  public.catalog_cost_revisions, public.price_lists, public.variant_prices,
  public.inventory_locations, public.inventory_counts, public.inventory_count_lines,
  public.inventory_balances, public.catalog_import_jobs, public.catalog_import_rows to authenticated;

drop policy if exists "Equipo lee catalogo" on public.catalog_products;
create policy "Equipo lee catalogo" on public.catalog_products for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin administra catalogo" on public.catalog_products;
create policy "Admin administra catalogo" on public.catalog_products for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Equipo lee variantes" on public.catalog_variants;
create policy "Equipo lee variantes" on public.catalog_variants for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin administra variantes" on public.catalog_variants;
create policy "Admin administra variantes" on public.catalog_variants for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Admin lee costos" on public.catalog_cost_revisions;
create policy "Admin lee costos" on public.catalog_cost_revisions for select to authenticated
using (public.is_poliplast_crm_admin());
drop policy if exists "Admin administra costos" on public.catalog_cost_revisions;
create policy "Admin administra costos" on public.catalog_cost_revisions for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Equipo lee listas" on public.price_lists;
create policy "Equipo lee listas" on public.price_lists for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin administra listas" on public.price_lists;
create policy "Admin administra listas" on public.price_lists for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Equipo lee precios" on public.variant_prices;
create policy "Equipo lee precios" on public.variant_prices for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin administra precios" on public.variant_prices;
create policy "Admin administra precios" on public.variant_prices for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Equipo lee ubicaciones" on public.inventory_locations;
create policy "Equipo lee ubicaciones" on public.inventory_locations for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin administra ubicaciones" on public.inventory_locations;
create policy "Admin administra ubicaciones" on public.inventory_locations for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Equipo lee conteos" on public.inventory_counts;
create policy "Equipo lee conteos" on public.inventory_counts for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Equipo inicia conteos" on public.inventory_counts;
create policy "Equipo inicia conteos" on public.inventory_counts for insert to authenticated
with check (public.is_poliplast_crm_user() and status = 'abierto');
drop policy if exists "Equipo actualiza conteos abiertos" on public.inventory_counts;
create policy "Equipo actualiza conteos abiertos" on public.inventory_counts for update to authenticated
using (public.is_poliplast_crm_user() and (status <> 'aprobado' or public.is_poliplast_crm_admin()))
with check (public.is_poliplast_crm_user() and (status <> 'aprobado' or public.is_poliplast_crm_admin()));

drop policy if exists "Equipo lee lineas conteo" on public.inventory_count_lines;
create policy "Equipo lee lineas conteo" on public.inventory_count_lines for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Equipo carga lineas conteo abierto" on public.inventory_count_lines;
create policy "Equipo carga lineas conteo abierto" on public.inventory_count_lines for insert to authenticated
with check (
  public.is_poliplast_crm_user()
  and exists (
    select 1 from public.inventory_counts c
    where c.id = count_id and c.status in ('abierto', 'en_revision')
  )
);
drop policy if exists "Equipo edita lineas conteo abierto" on public.inventory_count_lines;
create policy "Equipo edita lineas conteo abierto" on public.inventory_count_lines for update to authenticated
using (
  public.is_poliplast_crm_user()
  and exists (
    select 1 from public.inventory_counts c
    where c.id = count_id and (c.status in ('abierto', 'en_revision') or public.is_poliplast_crm_admin())
  )
)
with check (
  public.is_poliplast_crm_user()
  and exists (
    select 1 from public.inventory_counts c
    where c.id = count_id and (c.status in ('abierto', 'en_revision') or public.is_poliplast_crm_admin())
  )
);

drop policy if exists "Equipo lee stock aprobado" on public.inventory_balances;
create policy "Equipo lee stock aprobado" on public.inventory_balances for select to authenticated
using (public.is_poliplast_crm_user());
drop policy if exists "Admin actualiza stock aprobado" on public.inventory_balances;
create policy "Admin actualiza stock aprobado" on public.inventory_balances for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

drop policy if exists "Admin administra importaciones" on public.catalog_import_jobs;
create policy "Admin administra importaciones" on public.catalog_import_jobs for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());
drop policy if exists "Admin administra filas importadas" on public.catalog_import_rows;
create policy "Admin administra filas importadas" on public.catalog_import_rows for all to authenticated
using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());

-- No hay DELETE para usuarios autenticados. La reversión se registra como una
-- revisión/lote compensatorio, preservando la evidencia histórica.
revoke delete on public.catalog_products, public.catalog_variants, public.catalog_cost_revisions,
  public.price_lists, public.variant_prices, public.inventory_locations, public.inventory_counts,
  public.inventory_count_lines, public.inventory_balances, public.catalog_import_jobs,
  public.catalog_import_rows from authenticated;
