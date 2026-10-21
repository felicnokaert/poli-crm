-- Fotos aprobadas de Mercado Libre para los productos del catálogo (22/10, OK de Felipe). No toca catalog_products ni el
-- cotizador: es una tabla aparte que el CRM llena con "Usar esta foto" (solo administradores) y que cualquiera puede leer.
-- ml_items.picture_url: la foto grande de la publicación (la sincronización la completa; la miniatura es chica).
alter table public.ml_items add column if not exists picture_url text not null default '';

create table if not exists public.catalog_product_photos (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  url text not null,
  source text not null default 'mercadolibre',
  item_id text not null default '',
  sku text not null default '',
  approved_by text not null default '',
  approved_at timestamptz not null default now()
);
alter table public.catalog_product_photos enable row level security;
create policy catalog_product_photos_read on public.catalog_product_photos for select to authenticated using (public.is_poliplast_crm_user());
create policy catalog_product_photos_admin on public.catalog_product_photos for all to authenticated using (public.is_poliplast_crm_admin()) with check (public.is_poliplast_crm_admin());
