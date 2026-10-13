-- Etapa 6 del multiusuario: los canales de WhatsApp pasan de estar escritos a
-- mano en el codigo (y en user_allowed_channels) a una tabla que administra
-- Felipe sin tocar codigo.
--
-- Que NO cambia: las cuentas actuales ven exactamente los mismos canales
-- (felipe y felipecnokaert -> general, juan -> juan, info -> penosil). La
-- tabla se siembra con esos mismos reparto y user_allowed_channels() ahora lo
-- lee de ahi. Una cuenta sin fila sigue sin canales (ver 20261009180000).
--
-- phone_number_id queda en NULL para los 3 canales existentes: el webhook
-- sigue resolviendolos con sus variables de entorno (WHATSAPP_*_PHONE_ID); la
-- tabla solo agrega canales nuevos. Si ambos definen el mismo id, gana el entorno.
--
-- Rollback: recrear user_allowed_channels() con el CASE por email de
-- 20261009180000_user_allowed_channels_default_empty.sql y
-- `drop table public.whatsapp_channels`.

-- CHECK no admite subconsultas: la validacion de correos en minuscula va en una funcion.
create or replace function public.channel_emails_normalized(emails text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(e = lower(btrim(e))), true) from unnest(emails) as e;
$$;

create table if not exists public.whatsapp_channels (
  channel_key text primary key check (channel_key ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  label text not null check (length(btrim(label)) > 0),
  display_number text,
  phone_number_id text unique,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  member_emails text[] not null default '{}' check (public.channel_emails_normalized(member_emails)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_channels enable row level security;
revoke all on public.whatsapp_channels from anon;
grant select, insert, update, delete on public.whatsapp_channels to authenticated;

-- Solo Felipe administra canales (mismo criterio que "Solo Felipe" en Base tecnica).
create or replace function public.is_poliplast_channel_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('felipecnokaert@gmail.com', 'felipe@grupopoliplast.com.ar');
$$;

drop policy if exists "Cada usuario ve sus canales" on public.whatsapp_channels;
create policy "Cada usuario ve sus canales" on public.whatsapp_channels
  for select to authenticated
  using (
    public.is_poliplast_channel_admin()
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = any (member_emails)
  );

drop policy if exists "Felipe administra canales" on public.whatsapp_channels;
create policy "Felipe administra canales" on public.whatsapp_channels
  for all to authenticated
  using (public.is_poliplast_channel_admin())
  with check (public.is_poliplast_channel_admin());

insert into public.whatsapp_channels (channel_key, label, display_number, color, member_emails) values
  ('general', 'WhatsApp General', '+54 9 11 5262-7555', '#0d7764', array['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com']),
  ('juan',    'WhatsApp Juan',    '+54 9 11 2189-7610', '#5a3ea6', array['juan@grupopoliplast.com.ar']),
  ('penosil', 'WhatsApp Penosil', '+54 9 11 7155-8957', '#d9792b', array['info@grupopoliplast.com.ar'])
on conflict (channel_key) do nothing;

create or replace function public.user_allowed_channels()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(channel_key order by channel_key), array[]::text[])
  from public.whatsapp_channels
  where lower(coalesce(auth.jwt() ->> 'email', '')) = any (member_emails);
$$;
