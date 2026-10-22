-- Aplicada el 22/10/2026 con OK de Felipe.
-- Bucket product-photos: solo imágenes y hasta 5 MB. La escritura ya era solo de administradores (política 'product-photos admin write').
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
where id = 'product-photos';

-- catalog_product_photos.url: solo https desde orígenes conocidos (Supabase Storage, Mercado Libre, Shopify, fotos del CRM).
alter table public.catalog_product_photos
  add constraint catalog_product_photos_url_origin
  check (url ~ '^https://(nghwmtccpovrdtzvllwe\.supabase\.co/storage/|[a-z0-9.-]*mlstatic\.com/|cdn\.shopify\.com/|poli-crm\.vercel\.app/fotos-catalogo/)');
