# Poli-Entregas

Seguimiento de remitos, despachos y entregas de Grupo Poliplast (Via Cargo, Credifin, Full Pack, retira el cliente).
Cada remito tiene **estado**, **a quién le toca** (vendedor / expedición / expreso) e **historial** completo.

## Circuito
Cargado (sin imprimir) → Impreso → Despachado (fecha, guía, bultos) → Entregado (remito firmado).
En cualquier momento antes de salir: **Frenado** (sin stock con fecha estimada, falta pago, faltan datos, otro).
Después de salir: **Con problema** (demora, rechazo, devuelto, dañado, dirección mal).

## Uso
- `npm run maqueta` → la app con datos de ejemplo guardados en el navegador (sin login real, no toca la base). Para reiniciar los datos: en la consola `reiniciarMaqueta()`.
- `npm run dev` → contra la base real (necesita `.env.local`, ver `.env.example`).
- `npm test` → lógica (estados, plazos hábiles, lector de remitos, mensajes, filtros).
- `npm run build` → producción (`dist/`).

## Base de datos
Mismo proyecto Supabase que el CRM (mismos logins). Migración: `supabase/migrations/20261112_entregas_inicial.sql`
(tablas `entregas_*`, bucket privado `entregas`, RLS y las funciones `entregas_cambiar_estado` / `entregas_editar`).
Roles: admins del CRM = admin; cuentas en `entregas_roles` = su rol; resto de @grupopoliplast.com.ar = vendedor.

La regla de quién puede pasar de qué estado a cuál está en dos lugares que tienen que coincidir:
`src/lib/estados.ts` (botones) y `entregas_transicion_ok()` en la migración (autoridad real).
