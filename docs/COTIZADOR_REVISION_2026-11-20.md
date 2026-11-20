# Cotizador: revisión de SKU, variantes, fotos y precios (20/11)

Cruce del catálogo del cotizador (catalog_products / catalog_variants / variant_prices, lista vigente en USD) contra Mercado Libre (ml_items, con SKU por variación) y Shopify (shopify_variants).

## Lo que se hizo
- **126 fotos nuevas** en catalog_product_photos (60 de Shopify, 66 de la publicación activa de ML que más vendió), todas por SKU exacto y marcadas `claude - falta revisar` (se revisan en Base técnica → Fotos sin revisar).
- Productos que se pueden cotizar (vigentes con variante activa): **863**; con foto: **480 (56 %)**. Por marca: PURMAC 233/442, Grupo Poliplast 162/273, Resinplast 29/82, Penosil 56/66.
- Los 383 sin foto **no tienen SKU igual en ML ni en Shopify**: hay que subir la foto (Base técnica → Subir fotos, por SKU en el nombre del archivo).

## SKU
- 1.807 variantes, **0 sin SKU, 0 repetidos**. 482 están en ML y 492 en Shopify.
- 743 fichas de producto **sin ninguna variante** (quedaron vacías de importaciones viejas): no se ven al cotizar; conviene archivarlas.
- **Se venden y NO están en el cotizador** (71 SKU activos de ML y 117 de Shopify). Los que más venden:
  - TIM-W-MINI-NG / -BL (timbre WiFi, 576 vendidos), PS-PU-476-1/6/12 (espuma ignífuga; en el cotizador está como PS-PU-476P/M), BL-20LST-4-NE (balde x4), SP-PU-500-1 y SP-PU-750-1 (espuma Fischer), PC-AM-1/12 (pinceles), FV-450-1M2 y FV-300/450 por m² (el cotizador tiene FV-450 sin medida), PS-CAJA-810ML-12, TL-N°5/N6 (tela plástica), RODILLOLANA10CM-2/12, DM-010530-4 y quita-burbujas 100/250/500 ml, PR-10MM-5, KT-PS-810ML-1, KIT-4KG-FV, MONOMERO-5LTS, láminas PRFV 2.20/2.40, Gel Coat GC-AZ/BL/CEL (1/5/10/25 kg), KT-420 (Viscoplast 0,5 a 47 kg), KT-619 (2/10/20/45), telas roving 4/6 oz por metro, rollos de piso PVC 10 m² y rulo 18 m², baldes económicos 20 L (BL-20LNST, BL-RE-20LST), máquinas PURMAC (PM-1051, PM-MZB10A, PM-GT400, PM-PUMPA30, PM-REVOCADORAT7, PM-595VIAL), mangueras PM227/PM500, bandas calefactoras y manta IBC, productos de Hogar (mantas, tazas, plancha, cutter, riel).
  - **No se cargaron solos**: para entrar al cotizador necesitan precio de lista en USD confirmado (lo definen Felipe/Juan).
- SKU que en ML apuntan a **otro producto** (mismo código, distinto contenido): PG-FLUO-3G, PG-SETATA-3G, PG-SETOCE-3G (en el cotizador son sets de pigmentos; en ML, kits con resina), 3M-8576-1 (en ML es caja x10), EX-RODS30CM/50CM. Hay que separar los SKU.

## Precios para revisar (lista USD vs precio de ML; la mediana es ARS 1.712 por USD)
- **Casi seguro error de carga**: RE-608-0.450 resina epoxi 450 g a **USD 468,91** y RE-608-1.5 a **USD 576,31** (en ML ~$27.000 y ~$81.000). Parece que se cargó en pesos o con otra unidad.
- Muy por debajo de ML (×2,5 a ×6): imprimación Rayston KR-IMPRIMACIONGC 1/2/3/15 kg, gel coat GC1002/1020/1030 de 1 kg, pigmentos mica PG-PM/PG-PF, vaso medidor 1370 ml.
- Muy por encima de ML: agitadores de acero 2:1 y 4:1, retenedor 3M 501, moldes de silicona mini, pintura náutica 25 kg, robot limpiavidrios T30.

## Mejoras propuestas para el cotizador
1. **Corregir ya** los precios de RE-608-0.450 y RE-608-1.5 (y revisar la lista de arriba).
2. **Alerta de precio raro**: al cotizar, avisar si el precio de lista está a más de 2,5 veces del de ML/Shopify por el mismo SKU.
3. **Productos con variantes**: agrupar como en Shopify (un producto, opciones tamaño/color/pack), así se elige más rápido y una foto sirve para todas.
4. **Alta rápida de faltantes**: botón «Traer de ML/Shopify» que crea el producto con título, SKU y foto, quedando sin precio hasta que se confirme.
5. **Archivar las 743 fichas vacías**.
6. **Filtro «sin foto»** en el catálogo del cotizador y subida directa de la foto desde ahí.
7. **Stock** desde la app de conteo por SKU (ya está pedido en Trello).
