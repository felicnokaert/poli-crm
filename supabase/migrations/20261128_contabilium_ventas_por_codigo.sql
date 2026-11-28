-- 28/11 (pedido del chat de Logística para Stock): ventas por código de los últimos 6 y 12 meses, sin bajar todos los renglones.
create or replace view public.contabilium_ventas_por_codigo with (security_invoker = true) as
select upper(replace(codigo, ' ', '')) as codigo,
  sum(case when fecha >= (current_date - interval '6 months') then signo * coalesce(cantidad, 0) else 0 end) as unidades_6m,
  sum(case when fecha >= (current_date - interval '12 months') then signo * coalesce(cantidad, 0) else 0 end) as unidades_12m,
  sum(case when fecha >= (current_date - interval '6 months') then signo * coalesce(neto_usd, 0) else 0 end) as usd_6m,
  sum(case when fecha >= (current_date - interval '12 months') then signo * coalesce(neto_usd, 0) else 0 end) as usd_12m,
  max(case when signo > 0 then fecha end) as ultima_venta,
  (array_agg(nombre order by fecha desc nulls last))[1] as nombre,
  (array_agg(rubro order by fecha desc nulls last) filter (where rubro is not null))[1] as rubro,
  (array_agg(subrubro order by fecha desc nulls last) filter (where subrubro is not null))[1] as subrubro,
  array_agg(distinct company) as empresas
from public.contabilium_items
where codigo is not null and codigo <> ''
group by 1;
grant select on public.contabilium_ventas_por_codigo to authenticated;
