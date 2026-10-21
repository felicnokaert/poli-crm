-- SKU de cada publicación de Mercado Libre (22/10, OK de Felipe): sale del atributo SKU (SELLER_SKU) o del campo
-- del vendedor, normalizado en mayúsculas y sin espacios, igual que el SKU del catálogo del cotizador.
-- Solo agrega una columna y completa las publicaciones que ya estaban; no borra ni cambia otra cosa.
alter table public.ml_items add column if not exists sku text not null default '';

update public.ml_items m
set sku = coalesce((
  select upper(regexp_replace(a->>'value', '\s+', '', 'g'))
  from jsonb_array_elements(m.attributes) a
  where a->>'name' = 'SKU' and coalesce(a->>'value', '') <> ''
  limit 1
), '')
where m.sku = '';

create index if not exists ml_items_sku on public.ml_items (sku) where sku <> '';
