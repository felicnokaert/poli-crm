-- «¿Desde dónde sale?»: depósito de salida de cada pedido (Villa Domínico, Mar del Plata u otro escrito a mano).
-- Solo agrega: columna opcional, la suma al final de la vista y la deja editar. No toca filas ni políticas.
alter table public.entregas_pedidos add column if not exists deposito_salida text;

create or replace view public.entregas_pedidos_vista with (security_invoker = true) as
 SELECT p.id, p.codigo, p.n_remito, p.fecha_remito, p.cliente, p.cuit, p.direccion, p.localidad, p.provincia, p.cp,
    p.telefono, p.contacto, p.nota, p.expreso_id, p.vendedor_id, p.vendedor_email, p.estado, p.estado_desde,
    p.impreso_at, p.impreso_por, p.bloqueo_motivo, p.bloqueo_detalle, p.stock_estimado, p.fecha_despacho, p.n_guia,
    p.bultos, p.fecha_entrega, p.incidencia_motivo, p.incidencia_detalle, p.items, p.remito_hash, p.created_by,
    p.created_at, p.updated_at,
    (EXISTS ( SELECT 1 FROM entregas_archivos a WHERE a.pedido_id = p.id AND a.tipo = 'guia'::text)) AS tiene_guia_archivo,
    (EXISTS ( SELECT 1 FROM entregas_archivos a WHERE a.pedido_id = p.id AND a.tipo = 'remito_firmado'::text)) AS tiene_comprobante,
    (( SELECT count(*) AS count FROM entregas_archivos a WHERE a.pedido_id = p.id))::integer AS archivos,
    ( SELECT max(e.created_at) AS max FROM entregas_eventos e WHERE e.pedido_id = p.id) AS ultima_actividad,
    p.operador,
    d.operador AS despacho_operador,
    d.deposito AS despacho_deposito,
    d.user_id AS despacho_user_id,
    d.user_email AS despacho_email,
    d.created_at AS despacho_at,
    p.deposito_salida
   FROM entregas_pedidos p
     LEFT JOIN LATERAL ( SELECT e.operador, e.deposito, e.user_id, e.user_email, e.created_at
           FROM entregas_eventos e
          WHERE e.pedido_id = p.id AND e.tipo = 'estado'::text AND e.a_estado = 'despachado'::text
          ORDER BY e.created_at DESC
         LIMIT 1) d ON true;

CREATE OR REPLACE FUNCTION public.entregas_editar(p_pedido uuid, p_campos jsonb)
 RETURNS entregas_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text := public.entregas_mi_rol();
  v_antes jsonb;
  v_p public.entregas_pedidos;
  v_cambios jsonb := '{}'::jsonb;
  v_clave text;
  v_permitidas text[] := array['n_remito', 'fecha_remito', 'cliente', 'cuit', 'direccion', 'localidad', 'provincia', 'cp',
    'telefono', 'contacto', 'nota', 'expreso_id', 'n_guia', 'bultos', 'fecha_despacho', 'fecha_entrega', 'stock_estimado',
    'deposito_salida'];
begin
  if v_rol is null then raise exception 'Sin acceso a Entregas' using errcode = '42501'; end if;
  select to_jsonb(p) into v_antes from public.entregas_pedidos p where id = p_pedido for update;
  if v_antes is null then raise exception 'Pedido inexistente' using errcode = 'P0002'; end if;

  for v_clave in select jsonb_object_keys(coalesce(p_campos, '{}'::jsonb)) loop
    if not v_clave = any (v_permitidas) then raise exception 'Campo no editable: %', v_clave using errcode = '22023'; end if;
    if (v_antes -> v_clave) is distinct from (p_campos -> v_clave) then
      v_cambios := v_cambios || jsonb_build_object(v_clave, jsonb_build_object('antes', v_antes -> v_clave, 'despues', p_campos -> v_clave));
    end if;
  end loop;

  if v_cambios = '{}'::jsonb then
    select * into v_p from public.entregas_pedidos where id = p_pedido;
    return v_p;
  end if;

  update public.entregas_pedidos p set
    n_remito = case when p_campos ? 'n_remito' then upper(trim(p_campos ->> 'n_remito')) else p.n_remito end,
    fecha_remito = case when p_campos ? 'fecha_remito' then nullif(p_campos ->> 'fecha_remito', '')::date else p.fecha_remito end,
    cliente = case when p_campos ? 'cliente' then trim(p_campos ->> 'cliente') else p.cliente end,
    cuit = case when p_campos ? 'cuit' then nullif(trim(coalesce(p_campos ->> 'cuit', '')), '') else p.cuit end,
    direccion = case when p_campos ? 'direccion' then nullif(trim(coalesce(p_campos ->> 'direccion', '')), '') else p.direccion end,
    localidad = case when p_campos ? 'localidad' then nullif(trim(coalesce(p_campos ->> 'localidad', '')), '') else p.localidad end,
    provincia = case when p_campos ? 'provincia' then nullif(trim(coalesce(p_campos ->> 'provincia', '')), '') else p.provincia end,
    cp = case when p_campos ? 'cp' then nullif(trim(coalesce(p_campos ->> 'cp', '')), '') else p.cp end,
    telefono = case when p_campos ? 'telefono' then nullif(trim(coalesce(p_campos ->> 'telefono', '')), '') else p.telefono end,
    contacto = case when p_campos ? 'contacto' then nullif(trim(coalesce(p_campos ->> 'contacto', '')), '') else p.contacto end,
    nota = case when p_campos ? 'nota' then nullif(trim(coalesce(p_campos ->> 'nota', '')), '') else p.nota end,
    expreso_id = case when p_campos ? 'expreso_id' then nullif(p_campos ->> 'expreso_id', '')::uuid else p.expreso_id end,
    n_guia = case when p_campos ? 'n_guia' then nullif(trim(coalesce(p_campos ->> 'n_guia', '')), '') else p.n_guia end,
    bultos = case when p_campos ? 'bultos' then nullif(p_campos ->> 'bultos', '')::int else p.bultos end,
    fecha_despacho = case when p_campos ? 'fecha_despacho' then nullif(p_campos ->> 'fecha_despacho', '')::date else p.fecha_despacho end,
    fecha_entrega = case when p_campos ? 'fecha_entrega' then nullif(p_campos ->> 'fecha_entrega', '')::date else p.fecha_entrega end,
    stock_estimado = case when p_campos ? 'stock_estimado' then nullif(p_campos ->> 'stock_estimado', '')::date else p.stock_estimado end,
    deposito_salida = case when p_campos ? 'deposito_salida' then nullif(trim(coalesce(p_campos ->> 'deposito_salida', '')), '') else p.deposito_salida end,
    updated_at = now()
  where p.id = p_pedido
  returning * into v_p;

  insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos)
  values (p_pedido, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'edicion', v_cambios);

  return v_p;
end;
$function$;
