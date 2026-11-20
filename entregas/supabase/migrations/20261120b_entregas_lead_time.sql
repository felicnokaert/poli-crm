-- Lead time (impreso → despachado): la vista suma, AL FINAL, cuándo salió cada pedido (el último paso a
-- «despachado»). Solo agrega una columna a la vista entregas_pedidos_vista; no toca tablas ni políticas.
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
  d.user_email as despacho_email,
  d.created_at as despacho_at
from public.entregas_pedidos p
left join lateral (
  select e.operador, e.deposito, e.user_id, e.user_email, e.created_at
  from public.entregas_eventos e
  where e.pedido_id = p.id and e.tipo = 'estado' and e.a_estado = 'despachado'
  order by e.created_at desc
  limit 1
) d on true;
