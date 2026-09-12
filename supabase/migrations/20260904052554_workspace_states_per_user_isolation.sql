-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Esta migración YA estaba registrada en supabase_migrations.schema_migrations
-- del proyecto remoto (versión 20260904052554, nombre
-- "workspace_states_per_user_isolation") pero no existía como archivo .sql en
-- docs/ ni en ningún otro lugar del repo. Se reconstruye a partir de la
-- policy real vigente hoy en pg_policies (no se encontró el SQL original).
--
-- Reemplaza el espacio compartido único ('grupo-poliplast') introducido en
-- 20260829103831_espacio_compartido.sql por un workspace aislado por usuario
-- (workspace_key = auth.uid()). La fila histórica 'grupo-poliplast' queda en
-- la tabla pero ya no es alcanzable por ninguna policy (ver discrepancia en
-- el README de esta carpeta).

drop policy if exists "Equipo Poliplast comparte estado" on public.workspace_states;

create policy "Cada usuario ve solo su propio workspace" on public.workspace_states
for all to authenticated
using (workspace_key = (auth.uid())::text and public.is_poliplast_crm_user())
with check (workspace_key = (auth.uid())::text and public.is_poliplast_crm_user());
