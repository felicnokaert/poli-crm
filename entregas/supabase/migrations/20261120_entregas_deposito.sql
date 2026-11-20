-- Depósito desde donde se marca cada paso (Villa Domínico / Mar del Plata), además del operario.
-- El dispositivo recuerda su depósito y lo manda en el header x-deposito (base64 UTF-8), igual que x-operador.
-- Solo vale para expedición y administradores, y solo si está en la lista de entregas_config.depositos.
-- Todo aditivo y solo sobre objetos entregas_*. Los textos con tilde van con U&'' (sin caracteres raros en el SQL).

alter table public.entregas_config add column if not exists depositos text[] not null
  default array[U&'Villa Dom\00EDnico', 'Mar del Plata'];
alter table public.entregas_eventos add column if not exists deposito text;
alter table public.entregas_archivos add column if not exists deposito text;

create or replace function public.entregas_deposito()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw text := nullif(current_setting('request.headers', true), '')::json ->> 'x-deposito';
  v text;
begin
  if coalesce(v_raw, '') = '' then return null; end if;
  if coalesce(public.entregas_mi_rol(), '') not in ('expedicion', 'admin') then return null; end if;
  begin
    v := trim(convert_from(decode(v_raw, 'base64'), 'UTF8'));
  exception when others then return null;
  end;
  if not exists (select 1 from public.entregas_config c where c.id = 1 and v = any(c.depositos)) then return null; end if;
  return v;
end;
$$;
revoke all on function public.entregas_deposito() from public, anon;
grant execute on function public.entregas_deposito() to authenticated;

-- Cada evento (alta, cambio de estado, comentario, archivo) y cada archivo guardan el depósito solos.
alter table public.entregas_eventos alter column deposito set default public.entregas_deposito();
alter table public.entregas_archivos alter column deposito set default public.entregas_deposito();

-- Nadie puede inventar el depósito a mano (mismo criterio que el operador).
drop policy if exists entregas_eventos_comentar on public.entregas_eventos;
create policy entregas_eventos_comentar on public.entregas_eventos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) is not null
    and tipo = 'comentario'
    and user_id = (select auth.uid())
    and length(trim(coalesce(nota, ''))) > 0
    and operador is not distinct from (select public.entregas_operador())
    and deposito is not distinct from (select public.entregas_deposito())
  );
drop policy if exists entregas_archivos_subir on public.entregas_archivos;
create policy entregas_archivos_subir on public.entregas_archivos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) is not null
    and subido_por = (select auth.uid())
    and operador is not distinct from (select public.entregas_operador())
    and deposito is not distinct from (select public.entregas_deposito())
  );

-- La vista suma, al final, quién despachó cada pedido y desde qué depósito (último paso a "despachado").
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
  p.operador,
  d.operador as despacho_operador,
  d.deposito as despacho_deposito,
  d.user_id as despacho_user_id,
  d.user_email as despacho_email
from public.entregas_pedidos p
left join lateral (
  select e.operador, e.deposito, e.user_id, e.user_email
  from public.entregas_eventos e
  where e.pedido_id = p.id and e.tipo = 'estado' and e.a_estado = 'despachado'
  order by e.created_at desc
  limit 1
) d on true;
