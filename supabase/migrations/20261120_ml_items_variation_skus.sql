-- 20/11: SKU por variación. Las publicaciones con variaciones (colores, talles) guardan el SKU en cada variación, no en la publicación:
-- por eso 75 activas figuraban "sin SKU" (baldes, pisos, guantes, pigmentos). Se guarda [{id, sku}] por publicación. Aplicada con apply_migration.
alter table public.ml_items add column if not exists variation_skus jsonb not null default '[]'::jsonb;
