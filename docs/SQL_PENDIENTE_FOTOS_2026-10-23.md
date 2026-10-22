# SQL listo para endurecer las fotos del catálogo (NO aplicado: pide el OK de Felipe)

Verificado en vivo el 22/10: la política de escritura del bucket `product-photos` ya es solo administradores
(`product-photos admin write` con `is_poliplast_crm_admin()`); la lectura es pública. Lo que falta es limitar QUÉ se puede subir.

```sql
-- 1) Bucket: solo imágenes y hasta 5 MB (lo más pesado hoy es un PNG de 2,2 MB).
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
where id = 'product-photos';

-- 2) catalog_product_photos.url: solo desde orígenes conocidos (Supabase Storage, Mercado Libre, Shopify, fotos del CRM).
alter table public.catalog_product_photos
  add constraint catalog_product_photos_url_origin
  check (url ~ '^https://(nghwmtccpovrdtzvllwe\.supabase\.co/storage/|[a-z0-9.-]*mlstatic\.com/|cdn\.shopify\.com/|poli-crm\.vercel\.app/fotos-catalogo/)');
```

Los 149 URL de hoy cumplen la regla (64 ML, 61 Shopify, 12 CRM, 12 Supabase). Para revertir:
`alter table public.catalog_product_photos drop constraint catalog_product_photos_url_origin;` y
`update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'product-photos';`

## Hallazgo
`purmac/pm3500/pm1028.jpg` en el bucket `product-photos` tiene tipo `text/html` (probablemente una página de error guardada como .jpg):
es una foto rota. Conviene reemplazarla por la foto real (no se borró nada).
