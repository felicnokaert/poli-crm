-- Multiusuario: una cuenta que no está en la lista no debe ver ningún chat.
--
-- Antes: `else array['general']` -> cualquier correo @grupopoliplast.com.ar sin
-- asignación (una cuenta nueva, una prueba) leía los eventos del canal General
-- por la policy "Cada usuario lee solo sus canales" de whatsapp_events.
-- Ahora: `else array[]::text[]` -> sin canales, la policy no devuelve filas.
--
-- No cambia nada para las cuentas ya asignadas (felipe, felipecnokaert, juan,
-- info). Solo reemplaza el cuerpo de la función; no toca tablas ni datos.
-- Debe coincidir con channelsForEmail() en src/user-channels.mjs.
--
-- Rollback: volver a crear la función con `else array['general']`.

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
    else array[]::text[]
  end;
$$;
