-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260904165259, nombre "remove_penosil_from_felipe_channels") sin
-- archivo .sql correspondiente en docs/. Reconstruida a partir de la función
-- real vigente hoy: felipe@grupopoliplast.com.ar y felipecnokaert@gmail.com
-- ya no incluyen 'penosil' en su arreglo de canales permitidos (solo
-- 'general'). Se infiere el "antes" a partir de
-- 20260904163344_whatsapp_events_channel_rls.sql (reconstruida) porque no se
-- encontró el SQL original.

create or replace function public.user_allowed_channels()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case lower(coalesce(auth.jwt() ->> 'email', ''))
    when 'felipe@grupopoliplast.com.ar' then array['general']
    when 'felipecnokaert@gmail.com' then array['general']
    when 'juan@grupopoliplast.com.ar' then array['juan']
    when 'info@grupopoliplast.com.ar' then array['penosil']
    else array['general']
  end;
$$;
