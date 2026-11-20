-- Cuenta compartida de expedición: varias personas entran con el mismo usuario y eligen su nombre
-- en el dispositivo. La app manda ese nombre en el header x-operador (base64 UTF-8) y queda guardado
-- en cada evento, archivo y alta. Solo se respeta para cuentas marcadas como compartidas.
-- Todo aditivo y solo sobre objetos entregas_*.

alter table public.entregas_roles add column if not exists compartida boolean not null default false;
alter table public.entregas_config add column if not exists operadores text[] not null
  default array['Marcos', 'Neyen', 'Jeremías', 'Facundo', 'Juan'];
alter table public.entregas_pedidos add column if not exists operador text;
alter table public.entregas_eventos add column if not exists operador text;
alter table public.entregas_archivos add column if not exists operador text;

create or replace function public.entregas_operador()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw text := nullif(current_setting('request.headers', true), '')::json ->> 'x-operador';
  v text;
begin
  if coalesce(v_raw, '') = '' then return null; end if;
  if not exists (
    select 1 from public.entregas_roles r
    where r.email = lower(coalesce(auth.jwt() ->> 'email', '')) and r.compartida
  ) then return null; end if;
  begin
    v := convert_from(decode(v_raw, 'base64'), 'UTF8');
  exception when others then return null;
  end;
  return nullif(left(trim(v), 40), '');
end;
$$;

alter table public.entregas_eventos alter column operador set default public.entregas_operador();
alter table public.entregas_archivos alter column operador set default public.entregas_operador();

-- Alta: guarda quién cargó (si es cuenta compartida).
create or replace function public.entregas_pedido_antes_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.estado := 'cargado';
  new.estado_desde := now();
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.impreso_at := null;
  new.impreso_por := null;
  new.operador := public.entregas_operador();
  new.n_remito := upper(trim(new.n_remito));
  if new.vendedor_id is null then new.vendedor_id := auth.uid(); end if;
  select lower(u.email) into new.vendedor_email from auth.users u where u.id = new.vendedor_id;
  return new;
end;
$$;
revoke all on function public.entregas_pedido_antes_insert() from public, anon, authenticated;

-- La vista expone la columna nueva (se agrega al final).
create or replace view public.entregas_pedidos_vista with (security_invoker = true) as
select
  p.id, p.codigo, p.n_remito, p.fecha_remito, p.cliente, p.cuit, p.direccion, p.localidad, p.provincia, p.cp, p.telefono,
  p.contacto, p.nota, p.expreso_id, p.vendedor_id, p.vendedor_email, p.estado, p.estado_desde, p.impreso_at, p.impreso_por,
  p.bloqueo_motivo, p.bloqueo_detalle, p.stock_estimado, p.fecha_despacho, p.n_guia, p.bultos, p.fecha_entrega,
  p.incidencia_motivo, p.incidencia_detalle, p.items, p.remito_hash, p.created_by, p.created_at, p.updated_at,
  exists (select 1 from public.entregas_archivos a where a.pedido_id = p.id and a.tipo = 'guia') as tiene_guia_archivo,
  exists (select 1 from public.entregas_archivos a where a.pedido_id = p.id and a.tipo = 'remito_firmado') as tiene_comprobante,
  (select count(*) from public.entregas_archivos a where a.pedido_id = p.id)::int as archivos,
  (select max(e.created_at) from public.entregas_eventos e where e.pedido_id = p.id) as ultima_actividad,
  p.operador
from public.entregas_pedidos p;

-- Nadie puede inventar el nombre del operador a mano.
drop policy if exists entregas_eventos_comentar on public.entregas_eventos;
create policy entregas_eventos_comentar on public.entregas_eventos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) is not null
    and tipo = 'comentario'
    and user_id = (select auth.uid())
    and length(trim(coalesce(nota, ''))) > 0
    and operador is not distinct from (select public.entregas_operador())
  );
drop policy if exists entregas_archivos_subir on public.entregas_archivos;
create policy entregas_archivos_subir on public.entregas_archivos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) is not null
    and subido_por = (select auth.uid())
    and operador is not distinct from (select public.entregas_operador())
  );

-- El historial de archivos también registra al operador.
create or replace function public.entregas_archivo_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos, operador)
    values (new.pedido_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'archivo',
            jsonb_build_object('accion', 'subio', 'tipo', new.tipo, 'nombre', new.nombre, 'archivo_id', new.id), new.operador);
    update public.entregas_pedidos set updated_at = now() where id = new.pedido_id;
    return new;
  else
    insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos)
    values (old.pedido_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'archivo',
            jsonb_build_object('accion', 'borro', 'tipo', old.tipo, 'nombre', old.nombre));
    return old;
  end if;
end;
$$;
revoke all on function public.entregas_archivo_evento() from public, anon, authenticated;

-- Datos iniciales pedidos por Felipe (2026-11-12).
insert into public.entregas_roles (email, rol, nombre, compartida) values
  ('expedicion@grupopoliplast.com.ar', 'expedicion', 'Expedición', true),
  ('diegoraul@grupopoliplast.com.ar', 'admin', 'Diego Raúl', false)
on conflict (email) do update set rol = excluded.rol, nombre = excluded.nombre, compartida = excluded.compartida, updated_at = now();

update public.entregas_expresos set tracking_url = 'https://viacargo.com.ar/seguimiento-de-envio/' where nombre = 'Via Cargo' and tracking_url is null;
update public.entregas_expresos set tracking_url = 'https://credifin.com.ar/seguimiento/' where nombre = 'Credifin' and tracking_url is null;
