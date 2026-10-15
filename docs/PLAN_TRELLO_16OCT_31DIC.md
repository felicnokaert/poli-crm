# Plan del 16/10 al 31/12/2026 (desde el Trello "VENTAS — Grupo Poliplast")

En el CRM: **Tareas → Rutina** (botón "Cargar tareas") y **Tareas → Calendario**. Trello sigue siendo la fuente: el CRM solo lee y no modifica el tablero. Cada tarea trae el link a su tarjeta.

Cómo se reparte (97 tarjetas abiertas, máximo 5 por día, últimos 8 días hábiles de colchón):
- Urgentes primero, del 16 al 21/10: reputación ML (plazo 20/10), fraude en checkout, pedidos sin despachar, cargos de Full, triple duplicado, envíos ME1, caída de ventas, reversión de $675.000.
- Lunes y miércoles: Mercado Libre · martes y jueves: Shopify · miércoles: contenido y clips · viernes: CRM, cotizador y administración · comercial (prospección, cohorte, reactivación, objetivos Q4): todos los días.
- Fechas propias de Trello que siguen vigentes se respetan (ej. CyberMonday/Black Friday el 30/10).
- No se agendan: tarjetas de referencia ("Norte y métricas"), planes del día ya pasados, lo terminado, y "Exploración Amazon", "Marketplace Facebook — decisión" y estados "pausado/en mantenimiento".

Feriados y días sin carga (a confirmar): 23/11 (traslado del 20/11), 8/12 y 25/12 feriados; 7/12, 24/12 y 31/12 livianos.

Para regenerar después de cambios en Trello: exportar las tarjetas del tablero (JSON) y correr `node scripts/build-trello-plan.mjs <export.json>`; después "Cargar tareas" agrega solo las nuevas.
