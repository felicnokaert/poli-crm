-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260911141754, nombre "add_technical_documents_delete_policy")
-- sin archivo .sql correspondiente en docs/. Reconstruida a partir de la
-- policy real hoy en pg_policies.
--
-- DISCREPANCIA (ver README): docs/MIGRACION_BASE_TECNICA.sql dice
-- explícitamente "Sin política de DELETE a propósito: ningún documento se
-- borra o mueve durante la auditoría [...] Solo accesible via service_role
-- fuera de la app". Esta migración posterior relaja esa regla y agrega
-- DELETE para el rol admin. Confirmar con Felipe si esto fue intencional o
-- si el doc quedó desactualizado.
grant delete on public.technical_documents to authenticated;

create policy "Admin elimina documentos tecnicos" on public.technical_documents
for delete to authenticated
using (public.is_poliplast_crm_admin());
