-- Felipe 27/11: todo remito nuevo tiene que tener desde dónde sale (deposito_salida).
-- Se usa un disparador y no un CHECK: hay 15 pedidos viejos sin depósito (6 todavía en curso) y un CHECK
-- frenaría también sus cambios de estado. Así solo se frena el alta sin depósito o borrarle el depósito a un pedido.
create or replace function public.entregas_exigir_deposito_salida()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(btrim(new.deposito_salida), '') = ''
     and (tg_op = 'INSERT' or coalesce(btrim(old.deposito_salida), '') <> '') then
    raise exception 'Elegí desde dónde sale (Villa Domínico, Mar del Plata u Otro).' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists entregas_exigir_deposito_salida on public.entregas_pedidos;
create trigger entregas_exigir_deposito_salida
  before insert or update of deposito_salida on public.entregas_pedidos
  for each row execute function public.entregas_exigir_deposito_salida();
