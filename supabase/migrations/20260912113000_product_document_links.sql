-- Vínculos explícitos entre catálogo comercial y fichas técnicas validadas.
-- Reemplaza coincidencias heurísticas como fuente autoritativa, sin crearlas automáticamente.

create table if not exists public.product_document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.technical_documents(id) on delete cascade,
  scope_type text not null check (scope_type in ('product','variant','subfamily')),
  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  family text,
  subfamily text,
  reason text not null,
  verified_by uuid not null default auth.uid() references auth.users(id),
  verified_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint product_document_link_scope check (
    (scope_type = 'product' and product_id is not null and variant_id is null and family is null and subfamily is null)
    or (scope_type = 'variant' and variant_id is not null and product_id is null and family is null and subfamily is null)
    or (scope_type = 'subfamily' and product_id is null and variant_id is null and btrim(coalesce(family,'')) <> '' and btrim(coalesce(subfamily,'')) <> '')
  ),
  constraint product_document_link_reason check (btrim(reason) <> '')
);

create unique index if not exists product_document_link_product_uq on public.product_document_links(document_id, product_id) where scope_type = 'product';
create unique index if not exists product_document_link_variant_uq on public.product_document_links(document_id, variant_id) where scope_type = 'variant';
create unique index if not exists product_document_link_subfamily_uq on public.product_document_links(document_id, lower(btrim(family)), lower(btrim(subfamily))) where scope_type = 'subfamily';

alter table public.product_document_links enable row level security;
revoke all on public.product_document_links from anon;
grant select on public.product_document_links to authenticated;
grant insert, update, delete on public.product_document_links to authenticated;

drop policy if exists "Equipo lee vinculos tecnicos" on public.product_document_links;
create policy "Equipo lee vinculos tecnicos" on public.product_document_links for select to authenticated
using (public.is_poliplast_crm_user());

drop policy if exists "Admin administra vinculos tecnicos" on public.product_document_links;
create policy "Admin administra vinculos tecnicos" on public.product_document_links for all to authenticated
using (public.is_poliplast_crm_admin())
with check (public.is_poliplast_crm_admin() and verified_by = auth.uid());
