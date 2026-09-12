-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260911115355, nombre "add_technical_documents_storage_bucket")
-- sin archivo .sql correspondiente en docs/. Reconstruida a partir del bucket
-- y la columna reales hoy (storage.buckets, list_tables).
--
-- Bucket privado (no público) donde vive el PDF real de cada ficha técnica,
-- adjunto en el CRM - no solo su nombre.
insert into storage.buckets (id, name, public)
values ('technical-documents', 'technical-documents', false)
on conflict (id) do nothing;

alter table public.technical_documents
  add column if not exists storage_path text;

comment on column public.technical_documents.storage_path is
  'Ruta dentro del bucket privado technical-documents (Storage) donde vive el PDF real de la ficha, adjunto en el CRM - no solo su nombre. Nulo hasta que alguien lo adjunta (import nuevo o backfill manual de una ficha vieja).';

-- NOTA: las policies de storage.objects para este bucket (quién puede subir /
-- leer / borrar el archivo real) no se pudieron reconstruir con certeza desde
-- pg_policies en esta pasada - revisar en el dashboard de Supabase
-- (Storage > technical-documents > Policies) y completar acá si se detecta
-- algo que no esté cubierto por is_poliplast_crm_user()/is_poliplast_crm_admin().
