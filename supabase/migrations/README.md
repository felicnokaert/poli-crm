# Migraciones (reconstrucción retroactiva - 2026-09-12)

Estas migraciones **no se aplicaron hoy**. Son una reconstrucción retroactiva del
esquema que ya corre en producción en Supabase (proyecto `nghwmtccpovrdtzvllwe`,
"poli crm"), armada para que exista un registro versionado y confiable de qué
esquema hay en producción — algo que la auditoría de madurez
(`docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-12.md`) señaló como faltante.

**De acá en adelante: todo cambio de esquema nuevo (CREATE/ALTER TABLE, policies
RLS, funciones) se agrega como un archivo nuevo en esta carpeta, no como un
`.sql` suelto en `docs/`.** Los `.sql` viejos en `docs/` (`MIGRACION_*.sql`,
`ONLINE_DATA_MODEL.sql`) se dejan donde están como referencia histórica, pero
dejan de ser la fuente de verdad — lo es esta carpeta + lo que realmente corre
en Supabase.

## Cómo se armó esta reconstrucción

1. Se inventariaron los `.sql`/`.md` de `docs/` que documentan cambios de
   esquema, con su fecha real de commit (`git log`).
2. Se comparó contra el esquema real en Supabase (`list_tables` verbose,
   `list_migrations`, `pg_policies`, `pg_proc`, `storage.buckets` vía MCP).
3. Donde el esquema real y lo documentado coincidían, el archivo de migración
   reproduce el `.sql` original, fechado con el commit que lo introdujo.
4. Donde **no** coincidían, se reconstruyó a partir del esquema real (fuente
   de verdad) y se dejó una nota `DISCREPANCIA` en el archivo.

## Migraciones y su origen

| Archivo | Origen | Nota |
|---|---|---|
| `20260828120719_initial_schema.sql` | `docs/ONLINE_DATA_MODEL.sql` (commit `73e4722`) | Esquema base: accounts, contacts, conversations, tasks, evaluations, quick_reply_templates, whatsapp_events, copilot_states. |
| `20260829010746_acceso_corporativo.sql` | `docs/MIGRACION_ACCESO_CORPORATIVO.sql` (commit `ec91eec`) | Introduce `is_poliplast_crm_user()`. |
| `20260829103831_espacio_compartido.sql` | `docs/MIGRACION_ESPACIO_COMPARTIDO.sql` (commit `42f0884`) | Crea `workspace_states` como espacio **compartido** (una fila `'grupo-poliplast'`). Ver discrepancia abajo: esto ya no es el modelo vigente. |
| `20260904052554_workspace_states_per_user_isolation.sql` | **Sin doc** — reconstruida de la policy real | Reemplaza el espacio compartido por un workspace por usuario. |
| `20260904163344_whatsapp_events_channel_rls.sql` | **Sin doc** — reconstruida de `pg_proc`/`pg_policies` reales | Reparto de canales de WhatsApp (general/juan/penosil) por usuario. |
| `20260904165259_remove_penosil_from_felipe_channels.sql` | **Sin doc** — reconstruida | Ajusta `user_allowed_channels()`: felipe ya no ve el canal `penosil`. |
| `20260907153133_mercadolibre.sql` | `docs/MIGRACION_MERCADOLIBRE.sql` (commit `19c8d16`) | `mercadolibre_accounts`, `mercadolibre_items`. |
| `20260910204355_base_tecnica_technical_documents.sql` | `docs/MIGRACION_BASE_TECNICA.sql` (commit `9260f6b`), primera parte | `technical_documents`, `technical_document_history`, `is_poliplast_crm_admin()`. |
| `20260910204437_base_tecnica_harden_function_execute.sql` | `docs/MIGRACION_BASE_TECNICA.sql`, parte final (mismo commit) | Registrada aparte en el remoto; separada acá para que coincida 1:1 con `list_migrations`. |
| `20260910215628_catalogo_cotizador_inventario.sql` | `docs/MIGRACION_CATALOGO_COTIZADOR_INVENTARIO.sql` (commit `60488a1`) | Catálogo, costos, precios, inventario, import jobs. |
| `20260910231541_add_extracted_text_to_technical_documents.sql` | **Sin doc** — reconstruida de la columna real | `technical_documents.extracted_text`. |
| `20260911115355_add_technical_documents_storage_bucket.sql` | **Sin doc** — reconstruida | Bucket privado `technical-documents` + columna `storage_path`. |
| `20260911141754_add_technical_documents_delete_policy.sql` | **Sin doc** — reconstruida | Agrega DELETE para admin. Contradice el comentario de `MIGRACION_BASE_TECNICA.sql` ("sin política de DELETE a propósito"). |
| `20260912035103_commercial_rules.sql` | **Sin doc en absoluto** (ni `.sql` ni `.md`) — reconstruida íntegramente del esquema real | Tabla `commercial_rules`. Ver discrepancia. |

## Discrepancias detectadas entre lo documentado y la realidad (para que Felipe decida)

1. **`workspace_states` ya no es compartido.** `docs/MIGRACION_ESPACIO_COMPARTIDO.sql`
   describe un espacio único (`workspace_key = 'grupo-poliplast'`) leído/escrito
   por todo el equipo. La policy real hoy es
   `workspace_key = auth.uid()::text` (aislado por usuario) desde la migración
   `workspace_states_per_user_isolation` (2026-09-04). La fila histórica
   `'grupo-poliplast'` sigue en la tabla pero ya no es alcanzable por ninguna
   policy — es un registro huérfano. Si el "estado compartido de cartera" es
   una funcionalidad que se sigue queriendo, el código de la app probablemente
   ya no la usa como documentado; si es intencional (aislar por usuario), el
   doc quedó obsoleto y debería marcarse como superado.
2. **`technical_documents` sí tiene política de DELETE.** El comentario en
   `docs/MIGRACION_BASE_TECNICA.sql` dice explícitamente "Sin política de
   DELETE a propósito [...] Solo accesible via service_role fuera de la app".
   La migración real posterior `add_technical_documents_delete_policy`
   (2026-09-11) agregó `DELETE` para `is_poliplast_crm_admin()`. Confirmar si
   fue una decisión deliberada (y entonces actualizar el doc) o un cambio que
   se coló sin decisión explícita.
3. **`commercial_rules` no tiene ningún rastro documental.** No hay `.sql` ni
   `.md` en `docs/` que la mencione (se buscó "commercial_rules" y "regla
   comercial" en todo `docs/`). Se reconstruyó 100% desde el esquema real
   (columnas, checks, policies). Vale la pena que quede documentada en algún
   ADR/spec — hoy es una tabla de producción sin spec.
4. **10 migraciones ya estaban registradas en
   `supabase_migrations.schema_migrations`** (vía `list_migrations` del MCP de
   Supabase) pero **ninguna de las 6 migraciones anteriores a esa fecha**
   (esquema inicial, acceso corporativo, espacio compartido, Mercado Libre)
   aparece ahí — se aplicaron por SQL directo (dashboard o `execute_sql`), no
   por un flujo que registre versión. Esto confirma el diagnóstico de la
   auditoría: no había un registro fiable de qué se aplicó. A partir de ahora,
   cualquier cambio nuevo debería aplicarse con el CLI de Supabase
   (`supabase db push` contra un archivo en esta carpeta) para que quede
   tracked automáticamente.

## `mergeLogs` / identidad única de cliente

`docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md` describe `mergeClients` /
`consolidateDuplicateClients` y un `mergeLogs`. Se revisó el esquema real: **no
existe ninguna tabla `merge_logs` ni similar** en `public`. Todo eso vive
exclusivamente dentro del JSON de `workspace_states.data` (el mismo blob que
guarda `clients`/`interactions`/`tasks`/`inbox`) — no hubo cambio de esquema
SQL asociado. No se creó ninguna migración de tabla para esto a propósito,
para no inventar algo que no existe en producción.

## Pendiente

- **`supabase/config.toml` no configurado con el CLI real.** Se dejó un
  `config.toml` mínimo a mano (sin instalar el CLI de Supabase ni correr
  `supabase init` via npx, para no requerir una instalación pesada en esta
  pasada). Antes de usar `supabase db push`/`db diff` de verdad, correr
  `supabase login` + `supabase link --project-ref nghwmtccpovrdtzvllwe` y
  revisar que el `config.toml` generado por el CLI no difiera mucho del que se
  dejó acá.
- Policies de `storage.objects` para el bucket `technical-documents` (quién
  puede subir/leer/borrar el archivo real) no se pudieron reconstruir con
  certeza en esta pasada — revisar en el dashboard (Storage → policies).
