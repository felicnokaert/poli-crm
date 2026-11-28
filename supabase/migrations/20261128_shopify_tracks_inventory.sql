-- 28/11: si el producto sigue el stock. Sin seguimiento se compra siempre y no es «Activo con stock 0».
alter table public.shopify_products add column if not exists tracks_inventory boolean;
