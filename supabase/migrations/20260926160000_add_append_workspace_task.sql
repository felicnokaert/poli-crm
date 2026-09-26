-- Alta atomica de una tarea de automatizacion en workspace_states.data.tasks.
--
-- api/tasks-intake.js hacia leer el jsonb completo, agregar la tarea en JS y
-- volver a escribirlo todo (leer-modificar-escribir). Con varios POST a la vez
-- (la tarea de ML manda 8 hallazgos juntos) cada uno leia la misma base y el
-- ultimo en escribir se llevaba puestos a los demas. Este UPDATE hace todo en
-- una sola sentencia, que Postgres serializa con el lock de la fila, y ademas
-- evita duplicados por externalId dentro de la misma sentencia.
--
-- Devuelve true si inserto, false si ya existia una tarea con ese externalId
-- (o si no existe el workspace). Bumpea updated_at a proposito: el guardado
-- del navegador compara esa marca para detectar que el servidor escribio.
--
-- Solo service_role (la usa la funcion serverless); nadie mas puede llamarla.
create or replace function public.append_workspace_task(p_workspace_key text, p_task jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.workspace_states
     set data = jsonb_set(
           data,
           '{tasks}',
           coalesce(data -> 'tasks', '[]'::jsonb) || jsonb_build_array(p_task),
           true
         ),
         updated_at = now()
   where workspace_key = p_workspace_key
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(data -> 'tasks', '[]'::jsonb)) t
        where t ->> 'externalId' = p_task ->> 'externalId'
     );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.append_workspace_task(text, jsonb) from public, anon, authenticated;
grant execute on function public.append_workspace_task(text, jsonb) to service_role;
