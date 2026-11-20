-- Ajustes sugeridos por el linter de seguridad de Supabase (solo objetos entregas_*).
-- Las funciones de trigger no se llaman por API (los triggers no chequean EXECUTE al dispararse).
revoke all on function public.entregas_pedido_antes_insert() from public, anon, authenticated;
revoke all on function public.entregas_pedido_despues_insert() from public, anon, authenticated;
revoke all on function public.entregas_archivo_evento() from public, anon, authenticated;
alter function public.entregas_transicion_ok(text, text, text, boolean) set search_path = public;
