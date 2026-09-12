-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260904163344, nombre "whatsapp_events_channel_rls") sin archivo
-- .sql correspondiente en docs/. Reconstruida a partir de la función y policy
-- reales vigentes hoy en pg_proc / pg_policies.
--
-- Introduce el reparto de canales de WhatsApp por usuario (general/juan/penosil)
-- y reemplaza la policy de solo-lectura-para-todo-el-equipo por una que filtra
-- por canal permitido.

create or replace function public.user_allowed_channels()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case lower(coalesce(auth.jwt() ->> 'email', ''))
    when 'felipe@grupopoliplast.com.ar' then array['general', 'penosil']
    when 'felipecnokaert@gmail.com' then array['general', 'penosil']
    when 'juan@grupopoliplast.com.ar' then array['juan']
    when 'info@grupopoliplast.com.ar' then array['penosil']
    else array['general']
  end;
$$;

revoke all on function public.user_allowed_channels() from public;
grant execute on function public.user_allowed_channels() to authenticated;

drop policy if exists "Equipo Poliplast lee eventos" on public.whatsapp_events;

create policy "Cada usuario lee solo sus canales" on public.whatsapp_events
for select to authenticated
using (public.is_poliplast_crm_user() and channel = any (public.user_allowed_channels()));
