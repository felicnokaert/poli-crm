-- Backup diario automático (ver docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-15-septima.md,
-- Datos: "no hay backup automático" - techo real de ese frente, sin plan
-- pago de Supabase). Bucket privado donde cron-daily-maintenance.js sube un
-- snapshot JSON por día de las tablas propias de este CRM
-- (workspace_states, whatsapp_events, technical_documents,
-- technical_document_history, mercadolibre_accounts, mercadolibre_items,
-- copilot_states) - NO de las tablas del cotizador/inventario que comparten
-- este mismo proyecto de Supabase (catalog_*, sales_quotes, etc.), que son
-- responsabilidad de esa otra app.
--
-- Sin políticas de storage.objects a propósito: nadie de la app necesita
-- leer ni escribir acá salvo el cron server-side, que usa la service role
-- key y bypassea RLS - cero acceso para usuarios autenticados o anónimos
-- (RLS está habilitado por defecto en storage.objects y sin ninguna policy
-- explícita, deniega todo lo que no sea service_role).
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
