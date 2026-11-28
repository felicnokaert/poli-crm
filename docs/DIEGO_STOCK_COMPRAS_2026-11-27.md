# Stock, depósitos y compras — respuestas de Diego (27/11/2026)

Respuestas al mail «Poliplast App: cómo querés manejar stock, depósito y compras». Son las reglas para el módulo Stock y para Compras.

| # | Tema | Lo que dijo Diego | Qué hace la app |
|---|------|-------------------|-----------------|
| 1 | Número «real» | Hay que ver lado a lado: Contabilium de Villa Domínico, Contabilium de Mar del Plata y el conteo de cada depósito. Pueden no coincidir porque se cuenta por bulto cerrado, tambor o tira de baldes. | Stock en una sola hoja: V. Domínico (conteo), MDQ (conteo), V. Domínico (Contabilium) y MDQ (Contabilium). La diferencia se muestra, no se «corrige» sola. Falta: guardar la unidad de conteo (tambor, bulto o tira) para comparar en la misma unidad. |
| 2 | Ventas que descuentan | Algunas cosas salen de Mar del Plata, pero al hacer la FC o la COT se descuentan de Villa Domínico: depende del depósito que se elige al facturar. | No restar ventas por cuenta propia. Usar el stock por depósito que ya calcula Contabilium. Más adelante: aviso cuando una FC/COT descuenta de un depósito que no es el que despachó (cruce con Entregas, «¿Desde dónde sale?»). |
| 3 | Otros depósitos | Full de Mercado Libre. Todavía no está en Contabilium: habría que hacer un pase de depósito (restar de uno y sumar a «Full»). | Columna «Full» desde la API de ML (stock en Full por publicación). Propuesta de pase de depósito para cargar en Contabilium (la app no escribe en Contabilium). |
| 4 | Ajustes | Se ajusta de a uno o masivo, según lo que dicen los chicos, para que Contabilium no quede en negativo. Se complica porque se puede facturar sin stock o en negativo. | Lista «Para ajustar»: diferencias entre conteo y Contabilium, y productos en negativo, con CSV para hacer el ajuste masivo en Contabilium. |
| 5 | Cuándo contar | Jueves: Neyen. Viernes: Marcos y Braian. Diego define las familias completas que se cuentan cada día. | Agenda de conteo: Diego elige familias por día y persona. La app de conteo muestra «hoy te toca». Aviso si no se contó. |
| 6 | Dosificado | Al dosificar se separa un tambor, y ese tambor no se cuenta, porque se cuenta por tambor cerrado. | El conteo por tambor cerrado ya excluye lo abierto. No restar lo dosificado del conteo de tambores. Mostrar aparte «tambores abiertos para dosificar». |
| 7 | Compras | Se compra cuando piden. Haría falta un histórico de ventas mensuales: ranking de mayor a menor de 6 meses. | Productos → «Ranking de ventas» (Contabilium, 1/3/6 meses, por rubro y subrubro). Falta traer los renglones de las facturas. |
| 8 | Proveedores | Histórico de qué producto se le compra a cada proveedor, con celular y mail. Se va cargando; varios ya lo tienen. | Ficha de proveedor (producto ↔ proveedor, celular, mail), leyendo lo que ya está en Contabilium (Compras → Proveedores) y completando a mano. |
| 9 | Stock en ML y Shopify | Se debería actualizar desde la app. El problema: le ponen stock muy alto para que la publicación no se pause y no baje la performance. | Etapa futura, con aprobación: proponer el stock real o un tope de seguridad, sin bajar a 0 de golpe. Hoy la app solo lee. |
| 10 | Avisos por mail a Diego | Por ahora: pedidos sin despachar, sin leer en preparación, y entregas subidas hace más de 48 h. | Mail diario a Diego con esas 3 listas (lo arma la app de conteo con su Apps Script, o el CRM con su cron). |

## Próximos pasos propuestos
1. Stock: traer el stock por depósito de Contabilium (botón ya hecho; falta probarlo contra Contabilium real) y sumar la unidad de conteo.
2. Mail diario a Diego con los 3 avisos del punto 10.
3. Agenda de conteo jueves/viernes por familia.
4. Ranking de 6 meses en cuanto lleguen los renglones de las facturas.
5. Proveedores y pase a Full, después.
