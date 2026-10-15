-- Limpieza no destructiva de los avisos de seguridad de Supabase (15/10/2026).
-- Ninguna tabla ni dato se borra.

-- Estas funciones solo se usan con sesión iniciada (políticas RLS y carga de canales): el rol anónimo no las necesita.
revoke execute on function public.is_poliplast_crm_user() from anon, public;
revoke execute on function public.user_allowed_channels() from anon, public;
grant execute on function public.is_poliplast_crm_user() to authenticated, service_role;
grant execute on function public.user_allowed_channels() to authenticated, service_role;

-- La vista de importación vieja respeta los permisos de quien la consulta, no de quien la creó.
alter view public.import_polio8_plan set (security_invoker = true);
