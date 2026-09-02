# Handoff Codex → Claude — Ventas y CRM — 02/09/2026

## Estado técnico confirmado

- Producción: `https://poli-crm.vercel.app`.
- Código: `https://github.com/felicnokaert/poli-crm` (privado).
- Supabase/Vercel y acceso corporativo: operativos.
- WhatsApp General: no tocar; está operativo y en uso.
- WhatsApp Penosil: la memoria recibe datos, pero su estabilización y depuración técnica siguen siendo responsabilidad de Codex.
- Navegación ya separa `Por revisar` (pendientes) de `Historial` (una conversación por cliente).
- Método comercial incorporado a Negocios/Oportunidades: 12 etapas, objeción y criterio de prioridad.
- Limpieza conservadora ejecutada en producción. Se retiraron exclusivamente fixtures inequívocos; tras recargar no reaparecieron `Test Number` ni `CLIENTE PRUEBA CLAUDE`. Datos reales o ambiguos fueron preservados.
- Suite técnica: 37 pruebas aprobadas y compilación de producción correcta.

## Nueva decisión de producto

Se incorporará un módulo `Mis ventas` / `Ventas y comisiones`, basado en la lógica real de la hoja `Ventas 2026`.

Reglas confirmadas:

- Poliocho: 1% del total sin IVA.
- Poliplast: 3% del total sin IVA.
- Documento Factura o COT.
- Poliocho usa serie `0003`.
- Poliplast/PURMAC usa `0006`, `0011`, `0013` o `0016`.
- Registro manual primero; importación CSV después de validar el modelo.

La especificación técnica y funcional está en `docs/MODULO_VENTAS_Y_COMISIONES.md`.

## Trabajo útil para Claude ahora

1. Revisar el documento canónico `Sistema Operativo de Ventas — Grupo Poliplast` y no reabrir decisiones cerradas.
2. Diseñar el uso diario del módulo de ventas: qué carga Felipe, qué se calcula solo y qué revisa semanal/mensualmente.
3. Preparar una matriz de pruebas comerciales con casos reales anonimizados: Poliocho/Poliplast, Factura/COT, pesos/dólares, duplicado, nota de crédito o corrección.
4. Proponer el tablero mensual mínimo: venta neta, comisión, unidad, familia, cliente nuevo/recompra y evolución, evitando métricas de mera carga administrativa.
5. Mapear las columnas de `Ventas 2026` al nuevo modelo y señalar datos faltantes o inconsistentes. No modificar la hoja original.
6. Preparar reglas simples de seguimiento posterior a la venta y recompra por familia, sin crear una tarea por cada chat o cliente.
7. Continuar el frente comercial: Cohorte 1 (CARROZADOS + RESINPLAST), mensajes, objeciones, siguiente acción y criterio de prioridad; entregar datos estructurados para importación al CRM.

## Límites

- Claude no debe cambiar código, Supabase, Vercel, GitHub, Meta ni WhatsApp.
- No borrar ni reclasificar clientes reales.
- No crear tareas masivas.
- No inventar costos, ventas, facturas, COT, contactos ni resultados.
- Si aparece una decisión de negocio no documentada, consultar a Felipe.

## Entrega esperada

Un único informe accionable con:

- flujo diario/semanal/mensual;
- matriz de campos y reglas;
- casos de prueba;
- tablero recomendado;
- datos de Cohorte 1 listos para incorporar;
- dudas puntuales para Felipe;
- cierre literal: `PRÓXIMO PASO: CODEX — implementar y verificar en producción el módulo aprobado, sin tocar WhatsApp General.`

