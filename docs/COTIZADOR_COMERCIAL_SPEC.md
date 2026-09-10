# Cotizador comercial Grupo Poliplast

**Fecha:** 10/09/2026  
**Estado:** alcance inicial registrado; implementación pendiente.  
**Prioridad:** backlog explícito. No desplaza identidad única, limpieza histórica ni validación de Ventas.  
**Referencia funcional:** cotizador Resinplast 2026.

## 1. Decisión

Sí conviene construir un cotizador interno reutilizable dentro del CRM. Debe replicar la simpleza del cotizador Resinplast sin copiar datos estáticos ni crear otra fuente de precios paralela.

El cotizador arma y exporta propuestas. No define por sí mismo costos, márgenes, stock ni vigencia comercial.

## 2. Fuentes relevadas

| Fuente | Alcance observado | Moneda / IVA | Estado |
|---|---|---|---|
| Catálogo Maestro en Drive | Catálogo amplio con SKU, costo interno, precio, IVA, rentabilidad, rubro, proveedor y presentaciones | Mixto; requiere normalización | Fuente de cruce, no asumir vigencia de todos los precios |
| Resinplast · CF 2026 | 65 productos aproximados, escalas desde 0,1 / 1 / 5 / 10 / 25 y tambor-rollo | USD, IVA 21% incluido | Fuente comercial explícita, septiembre 2026 |
| Resinplast · Mayorista 2026 | Precio único mayorista; aplica desde USD 1.815 | USD, IVA 21% incluido | Fuente comercial explícita, septiembre 2026 |
| Penosil 2025-2026 | SKU, producto, descripción, color, presentación, caja y PVP | Moneda e interpretación comercial a confirmar antes de importar | Documento utilizable después de validación |
| Baldes abril 2026 | 10 SKU; minorista, medio pallet y mayorista | ARS, precio de venta + IVA | Fuente utilizable; revisar vigencia |
| PRFV agosto 2026 | Planchas/rollos por ancho, largo, espesor, m² y precio por m² | USD; Felipe informó precio sin IVA | Fuente utilizable; mínimo y dimensiones requieren confirmación |
| Shopify / web | Precio minorista visible y productos nuevos en borrador | Según tienda | Referencia secundaria; nunca importar borradores o aplicar +10% automáticamente sin aprobación |

## 3. Reglas de fuente

1. Cada precio debe guardar fuente, fecha de lista, moneda, tratamiento de IVA y estado de validación.
2. Una lista vencida puede consultarse, pero no cotizarse sin confirmación.
3. No mezclar precio mayorista, consumidor final, web y Mercado Libre.
4. Shopify no reemplaza el Catálogo Maestro y sus borradores no son precios aprobados.
5. Precio técnico/comercial y stock son datos separados.
6. Toda cotización debe mostrar fecha, validez, moneda, IVA y tipo de cambio usado.
7. Los productos `consultar` o en cero requieren intervención humana.

## 4. Experiencia objetivo

1. Elegir unidad/lista: Resinplast CF, Resinplast Mayorista, Penosil, Baldes, PRFV u otra futura.
2. Buscar o filtrar por categoría, producto o SKU.
3. Ingresar cantidad en la unidad correcta: unidad, kg, litro, m², tambor, rollo o bulto.
4. Aplicar automáticamente el tramo correspondiente.
5. Mostrar moneda original y conversión informativa a ARS cuando corresponda.
6. Agregar productos a una cotización.
7. Completar cliente, CUIT opcional, contacto, nota, entrega, pago y vigencia.
8. Revisar subtotal, IVA y total sin redondeos ocultos.
9. Guardar la cotización en la ficha de la empresa.
10. Exportar o imprimir PDF con identidad de la unidad comercial.

## 5. Modelo mínimo

### Lista de precios

- `id`, `nombre`, `unidadNegocio`, `vigenteDesde`, `vigenteHasta`;
- `moneda`, `ivaIncluido`, `tasaIva`, `tipoCambioFuente`;
- `fuenteDocumento`, `fuenteFecha`, `estadoValidacion`;
- `reglaGeneral` y observaciones.

### Ítem de lista

- `sku`, `producto`, `familia`, `presentacion`, `unidad`;
- `cantidadMinima`, `cantidadMaxima`, `precioUnitario`;
- `bulto`, `tambor`, `rollo` o dimensión cuando aplique;
- `requiereConsulta`, `vigente` y nota.

### Cotización

- empresa/contacto, vendedor, fecha y validez;
- lista y versión utilizadas;
- tipo de cambio congelado al momento de cotizar;
- ítems con cantidad, precio y unidad;
- subtotal, IVA, total, condiciones y estado;
- PDF generado y resultado comercial posterior.

## 6. Casos particulares

### Resinplast

- Consumidor final: tramo automático por cantidad.
- Mayorista: precio mayorista únicamente cuando se cumpla la condición comercial indicada en la lista.
- Rollo/tambor: respetar presentación completa.

### Baldes

- Tramos observados: minorista 1-111, medio pallet 112-224 y mayorista 225+.
- Los precios del documento son `+ IVA`.
- Respetar cantidades por bulto como dato informativo y posible validación futura.

### PRFV

- Precio por m² en USD sin IVA, según indicación de Felipe.
- El subtotal se calcula por m² totales del rollo o formato.
- Antes de implementar debe resolverse si el mínimo comercial es siempre rollo cerrado o si existen cortes; la imagen contiene largos de 130 y 150 m, por lo que no se fija todavía un mínimo genérico de 100 m.

### Penosil

- La lista contiene PVP y presentaciones por caja.
- Falta confirmar moneda, vigencia exacta y reglas mayorista/minorista.
- La regla orientativa `web o 10%` no se automatiza hasta definir si significa descuento, recargo o tolerancia y quién puede aprobarlo.

## 7. MVP recomendado

Primera versión: Resinplast solamente, porque ya tiene cotizador probado y listas CF/Mayorista estructuradas. Replicar comportamiento, incorporar guardado en empresa y PDF. Después agregar Baldes, PRFV y Penosil como adaptadores de listas, no como cotizadores separados.

## 8. Criterios de aceptación

- Una sola fuente de precio por cotización y versión visible.
- Tramo correcto en todos los límites de cantidad.
- IVA correcto para listas incluidas y no incluidas.
- Conversión USD/ARS trazable.
- Productos sin precio no pueden cotizarse silenciosamente.
- PDF coincide con pantalla y conserva moneda, IVA y validez.
- Cotización vinculada a una empresa sin crear duplicados.
- Ningún precio se publica ni modifica en Shopify, ML o Contabilium.

## 9. Orden dentro del roadmap

1. Registrar y validar fuentes de precios.
2. Conciliar el piloto Resinplast contra el cotizador actual.
3. Construir motor genérico de tramos, unidades, monedas e IVA.
4. Integrar carrito y PDF en el CRM.
5. Guardar cotización en empresa e historial.
6. Agregar Baldes y PRFV.
7. Agregar Penosil cuando se validen sus reglas.
8. Conectar Contabilium en modo lectura cuando esté disponible.

## 10. Preguntas abiertas mínimas

1. Penosil: moneda real del PVP y regla exacta para mayorista/minorista.
2. PRFV: mínimo real por formato y posibilidad de cortes.
3. Vigencia y responsable de aprobación de cada lista.
4. Condiciones de pago, entrega y duración estándar de una cotización.
5. Quién puede aplicar descuentos extraordinarios y cómo quedan auditados.
