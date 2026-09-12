-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Origen: parte final de docs/MIGRACION_BASE_TECNICA.sql (mismo commit
-- 9260f6b), separada aquí porque el proyecto remoto la registró como una
-- migración propia: "base_tecnica_harden_function_execute" (20260910204437).
--
-- Endurecimiento (aplicado 10/09/2026 tras revisar los advisors de
-- seguridad de Supabase): la función de trigger no debe ser invocable
-- directamente via RPC por anon/authenticated, solo por el trigger mismo;
-- is_poliplast_crm_admin no debe ser ejecutable por anon.
revoke execute on function public.log_technical_document_status_change() from public, anon, authenticated;
revoke execute on function public.is_poliplast_crm_admin() from anon;
