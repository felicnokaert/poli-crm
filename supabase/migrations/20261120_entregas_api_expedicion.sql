-- 20/11: Entregas para expedición sin login (opción B de Felipe). Aplicada con apply_migration.
-- entregas_api_log: cada consulta y cambio de la pantalla de expedición de la app de conteo (operario, depósito, hora). Solo servidor.
-- entregas_cambiar_estado_expedicion: solo service_role. Valida operario y depósito contra entregas_config y llama a la MISMA
-- entregas_cambiar_estado de Entregas con la identidad de expedicion@ (rol «expedicion») y los encabezados x-operador / x-deposito,
-- así las transiciones, los datos de cada estado y el evento con operador y depósito salen de las reglas de Entregas sin duplicarlas.
create table if not exists public.entregas_api_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  accion text not null,
  operador text,
  deposito text,
  pedido_id uuid,
  estado text,
  ok boolean not null default true,
  detalle text
);
create index if not exists entregas_api_log_at on public.entregas_api_log (at desc);
alter table public.entregas_api_log enable row level security;

create or replace function public.entregas_cambiar_estado_expedicion(p_pedido uuid, p_estado text, p_datos jsonb, p_nota text, p_operador text, p_deposito text)
returns public.entregas_pedidos
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cfg public.entregas_config;
  v_uid uuid;
  v_op text := trim(coalesce(p_operador, ''));
  v_dep text := trim(coalesce(p_deposito, ''));
begin
  select * into v_cfg from public.entregas_config where id = 1;
  if v_op = '' or not (v_op = any(v_cfg.operadores)) then raise exception 'Operario desconocido' using errcode = '22023'; end if;
  if v_dep = '' or not (v_dep = any(v_cfg.depositos)) then raise exception 'Deposito desconocido' using errcode = '22023'; end if;
  select id into v_uid from auth.users where email = 'expedicion@grupopoliplast.com.ar';
  if v_uid is null then raise exception 'Falta la cuenta de expedicion' using errcode = 'P0002'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'email', 'expedicion@grupopoliplast.com.ar', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.headers', json_build_object(
    'x-operador', replace(encode(convert_to(v_op, 'UTF8'), 'base64'), E'\n', ''),
    'x-deposito', replace(encode(convert_to(v_dep, 'UTF8'), 'base64'), E'\n', ''))::text, true);
  return public.entregas_cambiar_estado(p_pedido, p_estado, p_datos, p_nota);
end;
$$;
revoke all on function public.entregas_cambiar_estado_expedicion(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.entregas_cambiar_estado_expedicion(uuid, text, jsonb, text, text, text) to service_role;
