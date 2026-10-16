# Para una sesión con acceso a la base (Supabase `nghwmtccpovrdtzvllwe`)

Escrito el 16/10 desde una sesión local sin acceso a la base (el MCP de Supabase rechaza `execute_sql`,
`list_tables` y `query_logs`). Son las dos tareas del plan de mejora que necesitan la base. Nada de
esto está aplicado todavía.

## 1. Fichas técnicas que no se pueden borrar

Síntoma: "Se borraron 0 de 201". El borrado ya va por el servidor (`api/admin-users.js`, acción
`technical` → `lib/technical-admin.mjs`, con la clave de servicio) y el mensaje termina con
"Motivo: …" con lo que responde la base. En el código no hay otra tabla que apunte a
`technical_documents` sin `on delete cascade` (`technical_document_history` y
`product_document_links` son cascade; `replaced_by` es set null).

Pasos:
1. Pedirle a Felipe el texto exacto del "Motivo: …".
2. `select conname, conrelid::regclass, confdeltype from pg_constraint where confrelid = 'public.technical_documents'::regclass;`
   → cualquier fila con `confdeltype <> 'c'` y `<> 'n'` bloquea el borrado.
3. `select tgname, tgrelid::regclass, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.technical_documents'::regclass and not tgisinternal;`
   → un trigger BEFORE/AFTER DELETE que falle.
4. Revisar las policies de `storage.objects` del bucket `technical-documents` (el borrado de archivos
   es "mejor esfuerzo" y no debería frenar la fila, pero conviene confirmarlo).

## 2. Guardar por partes (el cambio que lleva Eficiencia y Fiabilidad a 5)

Hoy cada cambio guarda el espacio entero de la persona: `workspace_states.data` (un JSON con todas
sus empresas, tareas, ventas, bandeja…). Con miles de registros eso es lento, choca entre pestañas y
cualquier error de una pestaña vieja puede pisar mucho de una vez.

Propuesta: una fila por registro.

```sql
create table if not exists public.crm_records (
  workspace_key uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('clients','tasks','interactions','opportunities','sales','salesGoals','businessUnits','prospects','prospectSearches','researchJobs','boardLists','boardCards')),
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_key, collection, id)
);
alter table public.crm_records enable row level security;
create policy "Cada uno ve lo suyo" on public.crm_records for select to authenticated using (workspace_key = auth.uid());
create policy "Cada uno escribe lo suyo" on public.crm_records for insert to authenticated with check (workspace_key = auth.uid());
create policy "Cada uno actualiza lo suyo" on public.crm_records for update to authenticated using (workspace_key = auth.uid()) with check (workspace_key = auth.uid());
revoke all on public.crm_records from anon;
create index if not exists crm_records_updated on public.crm_records (workspace_key, updated_at);
```

Pasos (cada uno se publica y se deja andar unos días antes del siguiente):
1. **Copia inicial:** por cada fila de `workspace_states`, insertar sus registros en `crm_records`
   (una función SQL o un script con la clave de servicio). Los borrados de `deletedRecordIds` van con
   `deleted = true`.
2. **Escritura doble:** el navegador sigue guardando el JSON y además, en cada guardado, hace `upsert`
   solo de los registros que cambiaron (comparando `updatedAt`). `src/workspace-save.mjs` ya calcula
   versiones; el cambio va en `src/online.js` (`saveOnlineState`).
3. **Lectura desde `crm_records`:** `loadOnlineState` arma las colecciones desde la tabla; el JSON
   queda solo para ajustes chicos (perfil, metas, rutina, preferencias).
4. **Fin del JSON grande:** dejar de escribir las colecciones en `workspace_states`.
5. Adaptar el cron diario (`api/cron-daily-maintenance.js`), la limpieza (`lib/workspace-cleanup-admin.mjs`),
   el mapa RAPYP (`lib/rapyp-clients.mjs`) y el respaldo (`lib/backup.mjs`), que hoy leen el JSON.

Riesgo principal: dejar a alguien sin datos en el paso 3. Por eso la escritura doble va primero y el
paso 3 se prueba en localhost con una copia de un espacio real antes de publicar.
