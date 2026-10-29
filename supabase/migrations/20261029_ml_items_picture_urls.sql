-- 29/10: todas las fotos de cada publicación de Mercado Libre (para sumarlas a Shopify). Aplicada con apply_migration.
alter table public.ml_items add column if not exists picture_urls jsonb not null default '[]'::jsonb;
