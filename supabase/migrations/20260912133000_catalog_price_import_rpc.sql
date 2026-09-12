-- Crea listas de precio nuevas desde un CSV validado. Nunca pisa una lista anterior.

create or replace function public.apply_catalog_price_import(
  p_file_name text, p_file_sha256 text, p_rows jsonb, p_kind text,
  p_list_name text, p_currency text, p_vat_rate numeric, p_valid_from date
)
returns table(job_id uuid, price_list_id uuid, applied integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_job uuid; v_list uuid; v_row jsonb; v_variant uuid; v_before jsonb; v_count integer := 0;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if not public.is_poliplast_crm_admin() then raise exception 'Solo administradores pueden importar precios'; end if;
  if p_kind not in ('consumidor_final', 'mayorista') then raise exception 'Tipo de lista inválido'; end if;
  if upper(p_currency) not in ('ARS', 'USD') or p_vat_rate not between 0 and 1 then raise exception 'Moneda o IVA inválido'; end if;
  if nullif(btrim(p_list_name), '') is null or nullif(btrim(p_file_name), '') is null or nullif(btrim(p_file_sha256), '') is null then raise exception 'Nombre, archivo y huella son obligatorios'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'El lote no contiene filas'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by upper(btrim(r ->> 'sku')) having count(*) > 1) then raise exception 'El lote contiene SKU repetidos'; end if;

  insert into public.catalog_import_jobs(import_type,file_name,file_sha256,status,summary,imported_by,imported_by_email,applied_at)
  values('precios',btrim(p_file_name),lower(btrim(p_file_sha256)),'aplicado',jsonb_build_object('kind',p_kind,'requested',jsonb_array_length(p_rows)),auth.uid(),v_email,now()) returning id into v_job;

  insert into public.price_lists(name,brand,currency,vat_rate,valid_from,source,status,created_by,created_by_email)
  values((case when p_kind='mayorista' then 'Mayorista · ' else 'Consumidor final · ' end)||btrim(p_list_name),'Grupo Poliplast',upper(p_currency),p_vat_rate,p_valid_from,btrim(p_file_name),'vigente',auth.uid(),v_email) returning id into v_list;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if nullif(btrim(v_row ->> 'sku'),'') is null or coalesce((v_row ->> 'amount')::numeric,-1) < 0 or nullif(btrim(v_row ->> 'source'),'') is null then raise exception 'Fila % inválida',coalesce(v_row ->> 'row_number','?'); end if;
    select id into strict v_variant from public.catalog_variants where upper(btrim(sku))=upper(btrim(v_row ->> 'sku'));
    select jsonb_build_object('price_list_id',vp.price_list_id,'amount',vp.amount,'currency',pl.currency,'valid_from',pl.valid_from)
      into v_before from public.variant_prices vp join public.price_lists pl on pl.id=vp.price_list_id
      where vp.variant_id=v_variant and vp.status='confirmado' and pl.status='vigente'
        and ((p_kind='mayorista' and pl.name ~* '(mayorista|distribuidor)') or (p_kind='consumidor_final' and pl.name !~* '(mayorista|distribuidor)'))
      order by pl.valid_from desc,vp.created_at desc limit 1;
    insert into public.variant_prices(price_list_id,variant_id,min_quantity,amount,calculation_mode,status,import_job_id,created_by,created_by_email)
      values(v_list,v_variant,1,(v_row ->> 'amount')::numeric,'manual','confirmado',v_job,auth.uid(),v_email);
    insert into public.catalog_import_rows(import_job_id,row_number,sku,classification,incoming_data,before_data,after_data,applied)
      values(v_job,(v_row ->> 'row_number')::integer,btrim(v_row ->> 'sku'),'cambio',v_row,v_before,jsonb_build_object('price_list_id',v_list,'amount',(v_row ->> 'amount')::numeric,'currency',upper(p_currency)),true);
    v_count := v_count + 1;
  end loop;
  update public.catalog_import_jobs set summary=summary||jsonb_build_object('applied',v_count,'price_list_id',v_list) where id=v_job;
  return query select v_job,v_list,v_count;
end;
$$;

create or replace function public.revert_catalog_price_import(p_job_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count integer; v_list uuid;
begin
  if not public.is_poliplast_crm_admin() then raise exception 'Solo administradores pueden revertir precios'; end if;
  select distinct price_list_id into strict v_list from public.variant_prices where import_job_id=p_job_id;
  if not exists(select 1 from public.catalog_import_jobs where id=p_job_id and import_type='precios' and status='aplicado') then raise exception 'Lote inexistente o ya revertido'; end if;
  update public.variant_prices set status='vencido' where import_job_id=p_job_id and status='confirmado'; get diagnostics v_count=row_count;
  update public.price_lists set status='vencida',valid_until=least(coalesce(valid_until,current_date),current_date),updated_at=now() where id=v_list;
  update public.catalog_import_rows set applied=false where import_job_id=p_job_id;
  update public.catalog_import_jobs set status='revertido',reverted_at=now(),reverted_by=auth.uid(),reverted_by_email=coalesce(auth.jwt()->>'email','') where id=p_job_id;
  return v_count;
end;
$$;

revoke all on function public.apply_catalog_price_import(text,text,jsonb,text,text,text,numeric,date) from public,anon;
revoke all on function public.revert_catalog_price_import(uuid) from public,anon;
grant execute on function public.apply_catalog_price_import(text,text,jsonb,text,text,text,numeric,date) to authenticated;
grant execute on function public.revert_catalog_price_import(uuid) to authenticated;
