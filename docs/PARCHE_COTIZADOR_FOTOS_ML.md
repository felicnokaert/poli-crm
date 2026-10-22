# Cotizador: mostrar las fotos aprobadas desde Mercado Libre (22/10)

El CRM guarda las fotos aprobadas en la tabla `catalog_product_photos` (product_id, url, item_id, sku, approved_by,
approved_at). No toca `catalog_products.photo_path`. Este parche hace que el cotizador (repositorio
`poliplast-cotizador`) las use **solo cuando el producto no tiene foto propia**.

## Qué hace el parche (`docs/cotizador-fotos-ml.patch`, 3 archivos en `src/lib`)
- `productPhotos.ts`: `productPhotoUrl` deja pasar una URL completa (las del bucket siguen igual) y se suma
  `applyApprovedPhotos(products, photos)`: completa `photo_path` en memoria para los productos sin foto propia.
- `catalog.ts`: `loadCatalog` lee `catalog_product_photos` (si la tabla falla, sigue como antes) y aplica las fotos. **Ignora las que figuran sin revisar** (`approved_by` empieza con "claude"): hasta que Felipe las revise en el CRM, el cotizador no las usa.
- `productPhotos.test.ts`: pruebas de ambas cosas.
- No escribe nada en la base. Si después se sube una foto propia al bucket, esa gana.

## Verificado
En una copia del cotizador (commit d10da4c): 72 pruebas pasan (vitest), compila (tsc) y el linter no marca nada.
No se probó con la pantalla real del cotizador.

## Cómo aplicarlo (en el repositorio del cotizador)
```
git checkout -b fotos-aprobadas-ml
git apply /ruta/a/poli-crm/docs/cotizador-fotos-ml.patch
npm test && npm run build
```
Después se sube y se publica como cualquier cambio del cotizador (Felipe decide cuándo).

## Ojo
- Las fotos se muestran desde el enlace de Mercado Libre (no se copian al almacenamiento): si se borra la publicación,
  esa foto deja de verse.
- La grilla de administración del catálogo del cotizador (`src/lib/admin.ts`) lee `catalog_products` directo y no
  muestra estas fotos; el catálogo y la impresión con fotos sí.
