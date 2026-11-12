# Plan técnico de Shopify (jueves 12/11)

Base: diagnóstico de Sidekick del 01/09 (tarjeta de Trello «Shopify — plan técnico SEO/velocidad/checkout»), más lo que el CRM mide hoy. Los números de Sidekick son de septiembre: desde entonces se cargaron descripciones, SEO, pesos y precios en muchos productos, así que hay que **volver a pasar el diagnóstico** para saber cuánto mejoró.

## Lo que el CRM mide hoy (12/11)
- Ventas de Shopify: $ 0 en 7 días; 2 pedidos en 8 días (#1196 y #1197, pagos y sin despachar).
- 30 carritos abandonados por $ 18,7 millones.
- 20 productos activos sin peso (el checkout no puede cotizar el envío).
- 39 variantes activas fuera de la regla de precio (ML −10 %).

## 1. Checkout (lo que más plata mueve): 90,6 % abandona EN el checkout
Sidekick (01/09): 584 iniciaron checkout, 55 compraron.
Orden de trabajo:
1. **Compra de prueba hoy** con un producto barato: ver si Pagos y Envíos funcionan y cuánto cuesta el envío que muestra.
2. **Envío:** los 20 productos sin peso muestran envío mal o no lo cotizan. Cargar los pesos que faltan (`docs/pesos-shopify-desde-zipnova-2026-10-24.csv`, 113 sin dato) y revisar los dos baldes de 20 L con peso sospechoso (sin tapa x3 = 4.500 g; x10 = 5.600 g).
3. **CUIT visible** en el checkout y **IVA desglosado** en el carrito (el comprador de obra y empresas lo pide).
4. Confirmar que se puede **comprar como invitado**.
5. Los 5 productos con 100 % de abandono en checkout: `kit-pu47`, `balde-20l`, `pm-490-airless`, `pistola-penosil-c1`, `pm-795-cuerpo-bajo-airless`. Mirar para cada uno: precio, envío y stock mostrados. Las máquinas Airless son compras grandes: mejor atenderlas por WhatsApp (Juan o David) que esperar el checkout.

## 2. Velocidad
- 558 imágenes sin comprimir: causa número 1. Comprimir (sin perder calidad visible) y subir en WebP.
- 28 apps instaladas, 5 de ellas inyectando su propio código. **Dar de baja** (necesita OK de Felipe): *WhatsApp Button* (duplica el botón oficial de Meta) y *SendWILL* (duplica los popups de Klaviyo). Revisar si *Essential Upsell* y *Sternify* hacen lo mismo.

## 3. SEO técnico
- 112 páginas sin H1, 227 de 238 con meta title mal armado, 161 sin meta description, 125 imágenes sin texto alternativo, sin datos estructurados (Product, Organization, BreadcrumbList, FAQPage). Puntaje SEO global en septiembre: 63/100.
- Lo que Claude puede hacer desde acá, con OK de Felipe: meta title y meta description por producto, texto alternativo de imágenes con el nombre del producto (en tandas).
- Lo que se hace en el tema o con una app: H1 por plantilla y datos estructurados.

## 4. Tráfico
- Facebook e Instagram traen 68 % de las visitas y convierten 0,12 %. El tráfico directo de grupopoliplast.com convierte 2,65 %.
- Mientras el checkout no esté arreglado, **no sumar más tráfico pago**. Primero conversión, después tráfico.

## 5. Tema (EASYSPRAY y similares)
Las pestañas de metacampos se muestran arriba y otra vez abajo: el cliente baja mucho antes de llegar al botón de compra. Dejar solo las pestañas y subir precio y botón (Personalizar tema o Sidekick). El conector de Claude no puede editar el tema publicado.

## Quién hace qué
| Tarea | Quién |
|---|---|
| Compra de prueba, mirar Pagos y Envíos | Felipe (10 min) |
| Pesos que faltan | Claude con el conector, con OK |
| Texto alternativo, meta titles y descriptions | Claude, con OK, en tandas |
| Dar de baja apps | Felipe aprueba |
| CUIT e IVA en checkout, H1, datos estructurados, tema | Diseñador o Sidekick |
| Volver a pasar el diagnóstico de Sidekick | Felipe (para medir el antes y el después) |

## Catálogo Maestro v12 (decisión ya registrada en Trello)
- Sigue siendo la fuente canónica: 1.749 productos activos y 285 excluidos, clasificación cerrada, no hay v13.
- Pendiente: costos (65 % de la estructura económica), que dependen de Contabilium. **No crear v13 por cambios cosméticos.**
- Esto no necesita trabajo hoy: queda en espera hasta que los costos de Contabilium sean confiables.
