-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260910231541, nombre "add_extracted_text_to_technical_documents")
-- sin archivo .sql correspondiente en docs/. Reconstruida a partir de la
-- columna real hoy en information_schema/list_tables.
--
-- Texto plano extraído del PDF/documento real (pdf-text.js), usado solo para
-- citar líneas literales en el copiloto (ver
-- technical-document-governance.mjs citableExcerpt) - nunca para inventar ni
-- resumir contenido.
alter table public.technical_documents
  add column if not exists extracted_text text;

comment on column public.technical_documents.extracted_text is
  'Texto plano extraído del PDF/documento real (pdf-text.js), usado solo para citar líneas literales en el copiloto (ver technical-document-governance.mjs citableExcerpt) - nunca para inventar ni resumir contenido.';
