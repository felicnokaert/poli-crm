# Precios del cotizador corregidos (21/11/2026)

Regla de Felipe (21/11): precio de lista en USD = precio de Shopify (activo) × 1,10 ÷ dólar BNA (billete vendedor 20/11: $1.600).
Lista «Catalogo Maestro - importacion inicial», tramo desde 1 unidad. Se cambió solo lo que estaba claramente mal (más de 2,5 veces lo que da la regla).

| SKU | Antes (USD) | Shopify ($) | Ahora (USD) | id de variant_prices |
|---|---|---|---|---|
| RE-608-0.450 | 468,91 | 24.221 | 16,65 | 38068de9-2a09-49b3-96a7-f5124304993b |
| RE-608-1.5 | 576,31 | 72.972 | 50,17 | 8dac08cc-5b59-41c7-bffa-a06a59563c2d |
| 3M-RETENEDOR-1 | 23,839 | 9.963 | 6,85 | 01066cbc-33a6-4a08-8cdd-80434b411730 |

Para volver atrás: `update variant_prices set amount = <Antes> where id = '<id>'`.

## Para revisar (no se tocaron)
- RE-608-1.6: USD 578,34, mismo error que 1.5, pero no está en Shopify ni en ML activo (no hay de dónde sacar el precio).
- MT-ROBOTT30PRO-1: USD 601,16 contra 238,22 por la regla (2,5 veces).
- Más BARATOS en la lista que en Shopify (la lista da menos de 0,4 de la regla): RE-608-1 (12,64 vs 40,62; tiene tramos por cantidad coherentes), KT-710-10, KT-740-2, KT-740-4, KT-PS-EMPU46P-24, EX-RODS30CM-1, EX-RODS50CM-1, PM155889/PM155890, 3M-8576-1 (SKU reusado en ML para otro producto) y KR-IMPRIMACIONGC 1/2/3/15 kg (Shopify 5-6 veces más caro: puede estar mal Shopify). No se subieron porque puede estar mal Shopify y no la lista.
