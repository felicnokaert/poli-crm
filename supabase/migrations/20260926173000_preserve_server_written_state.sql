-- Red de seguridad en la base contra guardados de "todo el estado" que pisan
-- lo que escribio el servidor.
--
-- Contexto (26/09/2026): cada navegador guarda su workspace_states.data
-- completo, y la tabla no esta en Realtime, asi que una pestana abierta (con
-- codigo viejo o simplemente desactualizada) sobrescribe el jsonb y borra en
-- silencio tareas que api/tasks-intake.js habia agregado (8 tareas de ML del
-- 25/09 respondieron 200 y no quedaron). El arreglo del cliente
-- (src/workspace-save.mjs) solo protege a las pestanas que recargaron; este
-- trigger protege sin importar que version de la app tenga cada pestana.
--
-- Reglas (BEFORE UPDATE, por fila):
--  1. Toda tarea de automatizacion (con campo `origin`) que estaba en la fila
--     y NO viene en la nueva se reincorpora, salvo que su id figure en
--     deletedRecordIds.tasks (o sea que una persona la borro a proposito).
--  2. dailySignals (lo escribe solo el cron) no puede retroceder ni
--     desaparecer: si la nueva no lo trae o trae uno mas viejo, queda el actual.
--
-- A prueba de fallos: ante cualquier error interno deja pasar el guardado
-- tal cual llego. Un bug aca nunca debe bloquear a nadie el guardado.
create or replace function public.preserve_server_written_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing jsonb;
begin
  begin
    if jsonb_typeof(old.data) = 'object' and jsonb_typeof(new.data) = 'object' then
      select coalesce(jsonb_agg(t), '[]'::jsonb)
        into v_missing
        from jsonb_array_elements(coalesce(old.data -> 'tasks', '[]'::jsonb)) t
       where t ->> 'origin' is not null
         and not exists (
           select 1
             from jsonb_array_elements(coalesce(new.data -> 'tasks', '[]'::jsonb)) n
            where n ->> 'id' = t ->> 'id'
         )
         and not (coalesce(new.data -> 'deletedRecordIds' -> 'tasks', '[]'::jsonb) ? (t ->> 'id'));

      if jsonb_array_length(v_missing) > 0 then
        new.data := jsonb_set(
          new.data,
          '{tasks}',
          coalesce(new.data -> 'tasks', '[]'::jsonb) || v_missing,
          true
        );
      end if;

      if old.data ? 'dailySignals'
         and (
           not (new.data ? 'dailySignals')
           or coalesce(new.data -> 'dailySignals' ->> 'calculatedAt', '')
              < coalesce(old.data -> 'dailySignals' ->> 'calculatedAt', '')
         ) then
        new.data := jsonb_set(new.data, '{dailySignals}', old.data -> 'dailySignals', true);
      end if;
    end if;
  exception when others then
    return new;
  end;
  return new;
end;
$$;

drop trigger if exists workspace_states_preserve_server_state on public.workspace_states;
create trigger workspace_states_preserve_server_state
  before update on public.workspace_states
  for each row execute function public.preserve_server_written_state();
