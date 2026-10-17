# Sesión con acceso a la base: lista de tareas (17/10)

Escrito desde una sesión local **sin acceso a la base**: el MCP de Supabase rechaza `execute_sql`.
Todo lo de acá necesita la base (Supabase `nghwmtccpovrdtzvllwe`). Reemplaza y amplía
`PARA_SESION_CON_BASE_2026-10-16.md`, que sigue valiendo para el detalle de las tareas 4 y 6.

## Cómo arrancar (para Felipe)

Abrí una sesión de Claude en la nube sobre el repo `felicnokaert/poli-crm` y pegá:

> Leé CLAUDE.md y docs/PARA_SESION_CON_BASE_2026-10-17.md. Hacé las tareas en orden, de a una.
> Antes de cualquier cambio en la base mostrame qué vas a hacer y esperá mi OK. Al terminar cada
> tarea, decime qué quedó hecho y cómo lo verificaste.

## Reglas para la sesión

- Español, conciso, sin inventar resultados. Sin gastos (nada pago: ni planes, ni créditos de API).
- `execute_sql`: sentencias cortas y en ASCII (los textos largos, los acentos y los `DELETE` dan
  timeout). DDL con `apply_migration`, y guardar el mismo SQL en `supabase/migrations/`.
- Antes de tocar políticas o funciones de acceso, leer la definición actual (`pg_policies`,
  `pg_get_functiondef`). Nada que pueda dejar a alguien sin entrar sin el OK de Felipe.
- Vercel (plan gratis) admite 100 publicaciones por día y cada rama subida también publica: mergear
  en local y subir solo `main`, una vez por tanda. Ver "Noche 16/10" en CLAUDE.md.
- Tests `pnpm test`, build `pnpm build` antes de subir.

## 1. Pedidos de competencia que quedaron esperando (rápido)

En `prospect_requests` hay pedidos `COMPETENCIA NUEVA: …` sin procesar (Felipe vio "Tecno Ref" en
proceso desde el 16/10). Procesarlos como dice `docs/PROSPECCION_CLAUDE_WORKER.md`.

- Listar: `select id, family, status, scope, notes, created_at from prospect_requests where family like 'COMPETENCIA%' and status <> 'lista' order by created_at;`
- **Tecno Ref:** en una búsqueda web del 17/10 no apareció nada confiable con ese nombre (ni en
  registros de empresas). Usar la web o las redes del `scope` si las hay. Si no se encuentra, marcar
  `status = 'error'` con `progress` = el motivo, y avisarle a Felipe que lo cargue a mano (botón
  "Cargar a mano" en Academia → Competencia). No inventar datos.

## 2. Competidores: reclasificación y permiso de edición

Pedido de Felipe (16/10). Primero mirar si él ya lo hizo desde la app ("Cambiar familias", "+ Pegar varios"):
`select id, name, families, reviewed from competitors order by name;`

- Integral, Satch, Spinna y Tecniform **no** son de poliuretano: sacarles `Poliuretano` de `families`.
- BASF **sí** es de poliuretano.
- Competidores de poliuretano que faltan (`kind` fabricante, `reviewed = false`): Alkanos,
  Fana / Kilcom, Química del Caucho, MAS-TIN / NOSOTROS, Polytal, Poliresinas. Hay más; Felipe los
  suma con "+ Pegar varios".
- **Permiso de edición:** hoy no hay política `update` en `competitors` (solo lectura e inserción,
  más el borrado de Felipe). Por eso "Cambiar familias" reemplaza la ficha con borrar + insertar
  (`src/Competencia.jsx`, `saveFamilies`). Revisar las políticas actuales y sumar:

```sql
create policy competitors_admin_update on public.competitors for update to authenticated
  using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());
```

  Verificar después que "Cambiar familias" use el `update` (la respuesta trae la fila) y no el reemplazo.

## 3. Bandeja del equipo: ocultar lo ya clasificado y compartir la clasificación

Hoy la bandeja del equipo (`TEAM_INBOX_ENABLED=false`, pestaña Equipo) muestra contactos que Felipe
ya clasificó en su bandeja personal (no comerciales, cliente, etc.). Esa clasificación vive solo en
el JSON de Felipe (`workspace_states`), así que el resto no la ve.

Propuesta (código + base):
1. Tabla compartida, por ejemplo `contact_classifications (channel text, contact_key text,
   category text, classified_by text, updated_at timestamptz, primary key (channel, contact_key))`.
   Lectura para `is_poliplast_crm_user()`, escritura según la regla que decida Felipe (todos, o solo
   el dueño del canal).
2. Al clasificar en "Por revisar" (`src/hooks/useInboxActions.js`, `src/hooks/useInboxBatchActions.js`:
   excluir, marcar cliente, no requiere acción), escribir también en la tabla. La clave del contacto
   es `whatsappThreadKey` (`src/whatsapp-draft.mjs`).
3. La bandeja del equipo filtra por defecto lo clasificado, con un interruptor "Mostrar también los
   ya clasificados".
4. Copia inicial con lo que Felipe ya clasificó en su JSON.

Preguntarle a Felipe la regla de escritura antes de crear la tabla. Probar en localhost con
`localStorage.setItem('poliplast-simulate-member','1')` para ver la vista de otro miembro.

## 4. Fichas técnicas que no se pueden borrar

Igual que en `PARA_SESION_CON_BASE_2026-10-16.md` (sección 1): pedirle a Felipe el texto exacto del
"Motivo: …" y revisar restricciones y triggers sobre `technical_documents`.

## 5. Aprobación de cuentas nuevas: dejarla lista, **sin activarla**

Diseño ya decidido (ver CLAUDE.md, "Aprobación de accesos"). Se activa recién cuando todo el equipo
esté registrado; hasta entonces, dejar la tabla y la pantalla preparadas pero sin efecto.

- Tabla `crm_access (email text primary key, estado text check (estado in ('pendiente','aprobado','bloqueado')), updated_at, updated_by)`.
- Pre-aprobar a todos los ya registrados (`auth.users`).
- Pantalla "Tu cuenta espera aprobación" y panel en Más → Datos → Equipo y cuentas (solo Felipe
  aprueba, bloquea y revoca).
- El cambio de `is_poliplast_crm_user()` (admins fijos O dominio + aprobado) es lo que lo activa:
  **no aplicarlo** sin el OK explícito de Felipe y sin probar antes en localhost.

## 6. Guardar por partes (grande, en etapas)

Igual que en `PARA_SESION_CON_BASE_2026-10-16.md` (sección 2). Solo después de terminar todo lo
anterior, y con escritura doble primero.

## Ya hecho y no hace falta repetir

- Protección de contraseñas filtradas de Supabase: es **del plan pago**, no se activa. En su lugar,
  la app pide 8 caracteres o más al crear o cambiar la contraseña (`src/password-policy.mjs`).
  Felipe puede subir también el mínimo en Supabase (Authentication → Sign In / Providers → Email →
  largo mínimo 8), que es gratis.
- `WHATSAPP_BRIDGE_TOKEN` en Vercel: el puente está apagado (el endpoint devuelve 410); la variable
  se puede borrar.
