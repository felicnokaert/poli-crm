-- Aplicación atómica y reversible de costos desde el cotizador.
-- Cada cambio crea una revisión nueva. Revertir vence esas revisiones; no borra datos.

create or replace function public.apply_catalog_cost_import(
  p_file_name text,
  p_file_sha256 text,
  p_rows jsonb
)
returns table(job_id uuid, applied integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
  v_user_id uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_row jsonb;
  v_variant_id uuid;
  v_before jsonb;
  v_applied integer := 0;
begin
  if not public.is_poliplast_crm_admin() then
    raise exception 'Solo una cuenta administradora puede importar costos';
  end if;
  if nullif(btrim(p_file_name), '') is null or nullif(btrim(p_file_sha256), '') is null then
    raise exception 'Archivo y huella SHA-256 son obligatorios';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El lote no contiene filas';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    group by upper(btrim(item ->> 'sku')) having count(*) > 1
  ) then
    raise exception 'El lote contiene SKU repetidos';
  end if;

  insert into public.catalog_import_jobs (
    import_type, file_name, file_sha256, status, summary,
    imported_by, imported_by_email, applied_at
  ) values (
    'costos', btrim(p_file_name), lower(btrim(p_file_sha256)), 'aplicado',
    jsonb_build_object('requested', jsonb_array_length(p_rows)),
    v_user_id, v_email, now()
  ) returning id into v_job_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if coalesce((v_row ->> 'amount')::numeric, -1) < 0
       or upper(v_row ->> 'currency') not in ('ARS', 'USD')
       or nullif(btrim(v_row ->> 'source'), '') is null
       or nullif(btrim(v_row ->> 'sku'), '') is null then
      raise exception 'Fila % inválida', coalesce(v_row ->> 'row_number', '?');
    end if;

    select id into strict v_variant_id
    from public.catalog_variants
    where upper(btrim(sku)) = upper(btrim(v_row ->> 'sku'));

    select to_jsonb(c) - 'created_by' into v_before
    from public.catalog_cost_revisions c
    where c.variant_id = v_variant_id and c.status = 'confirmado'
    order by c.valid_from desc, c.created_at desc
    limit 1;

    insert into public.catalog_cost_revisions (
      variant_id, amount, currency, valid_from, source, status,
      import_job_id, created_by, created_by_email
    ) values (
      v_variant_id, (v_row ->> 'amount')::numeric, upper(v_row ->> 'currency'),
      coalesce(nullif(v_row ->> 'valid_from', '')::date, current_date),
      btrim(v_row ->> 'source'), 'confirmado', v_job_id, v_user_id, v_email
    );

    insert into public.catalog_import_rows (
      import_job_id, row_number, sku, classification, incoming_data,
      before_data, after_data, applied
    ) values (
      v_job_id, (v_row ->> 'row_number')::integer, btrim(v_row ->> 'sku'), 'cambio', v_row,
      v_before,
      jsonb_build_object('amount', (v_row ->> 'amount')::numeric, 'currency', upper(v_row ->> 'currency'), 'valid_from', coalesce(nullif(v_row ->> 'valid_from', '')::date, current_date), 'source', btrim(v_row ->> 'source')),
      true
    );
    v_applied := v_applied + 1;
  end loop;

  update public.catalog_import_jobs
  set summary = jsonb_build_object('requested', jsonb_array_length(p_rows), 'applied', v_applied)
  where id = v_job_id;
  return query select v_job_id, v_applied;
end;
$$;

create or replace function public.revert_catalog_cost_import(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_poliplast_crm_admin() then
    raise exception 'Solo una cuenta administradora puede revertir costos';
  end if;
  if not exists (
    select 1 from public.catalog_import_jobs
    where id = p_job_id and import_type = 'costos' and status = 'aplicado'
  ) then
    raise exception 'El lote no existe, no es de costos o ya fue revertido';
  end if;

  update public.catalog_cost_revisions
  set status = 'vencido', valid_until = least(coalesce(valid_until, current_date), current_date)
  where import_job_id = p_job_id and status = 'confirmado';
  get diagnostics v_count = row_count;

  update public.catalog_import_rows set applied = false where import_job_id = p_job_id;
  update public.catalog_import_jobs
  set status = 'revertido', reverted_at = now(), reverted_by = auth.uid(),
      reverted_by_email = coalesce(auth.jwt() ->> 'email', '')
  where id = p_job_id;
  return v_count;
end;
$$;

revoke all on function public.apply_catalog_cost_import(text, text, jsonb) from public, anon;
revoke all on function public.revert_catalog_cost_import(uuid) from public, anon;
grant execute on function public.apply_catalog_cost_import(text, text, jsonb) to authenticated;
grant execute on function public.revert_catalog_cost_import(uuid) to authenticated;

