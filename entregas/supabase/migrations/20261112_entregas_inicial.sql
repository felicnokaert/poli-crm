-- Poli-Entregas: seguimiento de remitos, despachos y entregas.
-- Vive en el mismo proyecto Supabase que el CRM (mismos logins), con tablas propias prefijo entregas_.
-- Todo cambio de estado pasa por entregas_cambiar_estado(), que valida rol + transición y deja el evento
-- en el historial en la misma transacción. La tabla de pedidos no admite UPDATE directo desde la app.

-- ---------------------------------------------------------------- Roles
create table if not exists public.entregas_roles (
  email text primary key check (email = lower(email)),
  rol text not null check (rol in ('vendedor', 'expedicion', 'admin')),
  nombre text,
  updated_at timestamptz not null default now()
);

-- Rol de quien llama: admin del CRM → admin; si figura en entregas_roles → ese rol;
-- si es usuario del CRM (@grupopoliplast.com.ar) → vendedor; si no, null (sin acceso).
create or replace function public.entregas_mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_poliplast_crm_admin() then 'admin'
    else coalesce(
      (select r.rol from public.entregas_roles r where r.email = lower(coalesce(auth.jwt() ->> 'email', ''))),
      case when public.is_poliplast_crm_user() then 'vendedor' end
    )
  end;
$$;

-- ---------------------------------------------------------------- Configuración
create table if not exists public.entregas_config (
  id int primary key default 1 check (id = 1),
  horas_sin_imprimir int not null default 4 check (horas_sin_imprimir between 1 and 72),
  dias_sin_despachar int not null default 2 check (dias_sin_despachar between 1 and 30),
  dias_bloqueado int not null default 3 check (dias_bloqueado between 1 and 60),
  updated_at timestamptz not null default now()
);
insert into public.entregas_config (id) values (1) on conflict do nothing;

create table if not exists public.entregas_expresos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tracking_url text,
  dias_esperados int not null default 5 check (dias_esperados between 0 and 60),
  requiere_guia boolean not null default true,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.entregas_expresos (nombre, dias_esperados, requiere_guia, orden) values
  ('Via Cargo', 5, true, 1),
  ('Credifin', 5, true, 2),
  ('Full Pack', 5, true, 3),
  ('Retira el cliente', 0, false, 9)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------- Pedidos
create table if not exists public.entregas_pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  n_remito text not null check (length(trim(n_remito)) > 0),
  fecha_remito date,
  cliente text not null check (length(trim(cliente)) > 0),
  cuit text,
  direccion text,
  localidad text,
  provincia text,
  cp text,
  telefono text,
  contacto text,
  nota text,
  expreso_id uuid references public.entregas_expresos(id),
  vendedor_id uuid not null default auth.uid() references auth.users(id),
  vendedor_email text,
  estado text not null default 'cargado'
    check (estado in ('cargado', 'impreso', 'bloqueado', 'despachado', 'entregado', 'incidencia', 'cancelado')),
  estado_desde timestamptz not null default now(),
  impreso_at timestamptz,
  impreso_por uuid references auth.users(id),
  bloqueo_motivo text check (bloqueo_motivo in ('sin_stock', 'falta_pago', 'datos_incompletos', 'otro')),
  bloqueo_detalle text,
  stock_estimado date,
  fecha_despacho date,
  n_guia text,
  bultos int check (bultos is null or bultos between 0 and 999),
  fecha_entrega date,
  incidencia_motivo text check (incidencia_motivo in ('demora', 'rechazado', 'devuelto', 'danado', 'direccion', 'otro')),
  incidencia_detalle text,
  items jsonb not null default '[]'::jsonb,
  remito_hash text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un mismo remito no puede estar dos veces en curso (sí puede re-cargarse si el anterior se canceló).
create unique index if not exists entregas_pedidos_remito_vivo on public.entregas_pedidos (n_remito) where estado <> 'cancelado';
create index if not exists entregas_pedidos_estado_idx on public.entregas_pedidos (estado);
create index if not exists entregas_pedidos_vendedor_idx on public.entregas_pedidos (vendedor_id);
create index if not exists entregas_pedidos_created_idx on public.entregas_pedidos (created_at desc);
create index if not exists entregas_pedidos_hash_idx on public.entregas_pedidos (remito_hash);

-- ---------------------------------------------------------------- Historial (solo se agrega)
create table if not exists public.entregas_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.entregas_pedidos(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id),
  user_email text default lower(coalesce(auth.jwt() ->> 'email', '')),
  tipo text not null check (tipo in ('alta', 'estado', 'archivo', 'comentario', 'edicion')),
  de_estado text,
  a_estado text,
  nota text,
  datos jsonb,
  created_at timestamptz not null default now()
);
create index if not exists entregas_eventos_pedido_idx on public.entregas_eventos (pedido_id, created_at);
create index if not exists entregas_eventos_created_idx on public.entregas_eventos (created_at desc);

-- ---------------------------------------------------------------- Archivos
create table if not exists public.entregas_archivos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.entregas_pedidos(id) on delete cascade,
  tipo text not null check (tipo in ('remito', 'guia', 'remito_firmado', 'foto', 'otro')),
  nombre text not null,
  storage_path text not null unique,
  mime text,
  tamano bigint,
  hash text,
  subido_por uuid default auth.uid() references auth.users(id),
  subido_email text default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now()
);
create index if not exists entregas_archivos_pedido_idx on public.entregas_archivos (pedido_id);

-- ---------------------------------------------------------------- Vista con calculados
create or replace view public.entregas_pedidos_vista with (security_invoker = true) as
select
  p.*,
  exists (select 1 from public.entregas_archivos a where a.pedido_id = p.id and a.tipo = 'guia') as tiene_guia_archivo,
  exists (select 1 from public.entregas_archivos a where a.pedido_id = p.id and a.tipo = 'remito_firmado') as tiene_comprobante,
  (select count(*) from public.entregas_archivos a where a.pedido_id = p.id)::int as archivos,
  (select max(e.created_at) from public.entregas_eventos e where e.pedido_id = p.id) as ultima_actividad
from public.entregas_pedidos p;

-- ---------------------------------------------------------------- Triggers
create or replace function public.entregas_pedido_antes_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.estado := 'cargado';
  new.estado_desde := now();
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.impreso_at := null;
  new.impreso_por := null;
  new.n_remito := upper(trim(new.n_remito));
  if new.vendedor_id is null then new.vendedor_id := auth.uid(); end if;
  select lower(u.email) into new.vendedor_email from auth.users u where u.id = new.vendedor_id;
  return new;
end;
$$;

drop trigger if exists entregas_pedido_antes_insert on public.entregas_pedidos;
create trigger entregas_pedido_antes_insert before insert on public.entregas_pedidos
  for each row execute function public.entregas_pedido_antes_insert();

create or replace function public.entregas_pedido_despues_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, a_estado, nota)
  values (new.id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'alta', 'cargado', new.nota);
  return new;
end;
$$;

drop trigger if exists entregas_pedido_despues_insert on public.entregas_pedidos;
create trigger entregas_pedido_despues_insert after insert on public.entregas_pedidos
  for each row execute function public.entregas_pedido_despues_insert();

create or replace function public.entregas_archivo_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos)
    values (new.pedido_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'archivo',
            jsonb_build_object('accion', 'subio', 'tipo', new.tipo, 'nombre', new.nombre, 'archivo_id', new.id));
    update public.entregas_pedidos set updated_at = now() where id = new.pedido_id;
    return new;
  else
    insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos)
    values (old.pedido_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'archivo',
            jsonb_build_object('accion', 'borro', 'tipo', old.tipo, 'nombre', old.nombre));
    return old;
  end if;
end;
$$;

drop trigger if exists entregas_archivo_evento on public.entregas_archivos;
create trigger entregas_archivo_evento after insert or delete on public.entregas_archivos
  for each row execute function public.entregas_archivo_evento();

-- ---------------------------------------------------------------- Transiciones (espejo de src/lib/estados.ts)
create or replace function public.entregas_transicion_ok(p_de text, p_a text, p_rol text, p_es_dueno boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_de = p_a then false
    when p_rol = 'admin' then true
    when p_a = 'impreso' and p_de = 'cargado' then p_rol = 'expedicion'
    when p_a = 'cargado' and p_de = 'impreso' then p_rol = 'expedicion'
    when p_a = 'bloqueado' and p_de in ('cargado', 'impreso') then p_rol in ('expedicion', 'vendedor')
    when p_a = 'cargado' and p_de = 'bloqueado' then p_rol in ('expedicion', 'vendedor')
    when p_a = 'impreso' and p_de = 'bloqueado' then p_rol = 'expedicion'
    when p_a = 'despachado' and p_de in ('cargado', 'impreso', 'bloqueado', 'incidencia') then p_rol in ('expedicion', 'vendedor')
    when p_a = 'entregado' and p_de in ('despachado', 'incidencia') then p_rol in ('expedicion', 'vendedor')
    when p_a = 'incidencia' and p_de = 'despachado' then p_rol in ('expedicion', 'vendedor')
    when p_a = 'cancelado' and p_de in ('cargado', 'impreso', 'bloqueado', 'incidencia') then p_rol = 'vendedor' and p_es_dueno
    else false
  end;
$$;

create or replace function public.entregas_cambiar_estado(
  p_pedido uuid,
  p_estado text,
  p_datos jsonb default '{}'::jsonb,
  p_nota text default null
)
returns public.entregas_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.entregas_mi_rol();
  v_p public.entregas_pedidos;
  v_de text;
  v_datos jsonb := coalesce(p_datos, '{}'::jsonb);
begin
  if v_rol is null then raise exception 'Sin acceso a Entregas' using errcode = '42501'; end if;

  select * into v_p from public.entregas_pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido inexistente' using errcode = 'P0002'; end if;
  v_de := v_p.estado;

  if not public.entregas_transicion_ok(v_de, p_estado, v_rol, v_p.vendedor_id = auth.uid()) then
    raise exception 'No podés pasar este pedido de % a %', v_de, p_estado using errcode = '42501';
  end if;

  -- Al salir de un estado se limpian sus datos propios.
  if p_estado <> 'bloqueado' then
    v_p.bloqueo_motivo := null; v_p.bloqueo_detalle := null; v_p.stock_estimado := null;
  end if;
  if p_estado not in ('incidencia', 'entregado') then
    v_p.incidencia_motivo := null; v_p.incidencia_detalle := null;
  end if;

  if p_estado = 'impreso' then
    v_p.impreso_at := coalesce(v_p.impreso_at, now());
    v_p.impreso_por := coalesce(v_p.impreso_por, auth.uid());
  elsif p_estado = 'cargado' then
    if v_de = 'impreso' then v_p.impreso_at := null; v_p.impreso_por := null; end if;
    if v_de = 'cancelado' then v_p.fecha_despacho := null; v_p.fecha_entrega := null; end if;
  elsif p_estado = 'bloqueado' then
    if coalesce(v_datos ->> 'bloqueo_motivo', '') = '' then raise exception 'Falta el motivo' using errcode = '22023'; end if;
    v_p.bloqueo_motivo := v_datos ->> 'bloqueo_motivo';
    v_p.bloqueo_detalle := nullif(trim(coalesce(v_datos ->> 'bloqueo_detalle', '')), '');
    v_p.stock_estimado := nullif(v_datos ->> 'stock_estimado', '')::date;
  elsif p_estado = 'despachado' then
    v_p.fecha_despacho := coalesce(nullif(v_datos ->> 'fecha_despacho', '')::date, current_date);
    if v_datos ? 'n_guia' then v_p.n_guia := nullif(trim(coalesce(v_datos ->> 'n_guia', '')), ''); end if;
    if v_datos ? 'bultos' then v_p.bultos := nullif(v_datos ->> 'bultos', '')::int; end if;
    if coalesce(v_datos ->> 'expreso_id', '') <> '' then v_p.expreso_id := (v_datos ->> 'expreso_id')::uuid; end if;
    v_p.impreso_at := coalesce(v_p.impreso_at, now());
    v_p.fecha_entrega := null;
  elsif p_estado = 'entregado' then
    v_p.fecha_entrega := coalesce(nullif(v_datos ->> 'fecha_entrega', '')::date, current_date);
    v_p.incidencia_motivo := null; v_p.incidencia_detalle := null;
  elsif p_estado = 'incidencia' then
    if coalesce(v_datos ->> 'incidencia_motivo', '') = '' then raise exception 'Falta el motivo' using errcode = '22023'; end if;
    v_p.incidencia_motivo := v_datos ->> 'incidencia_motivo';
    v_p.incidencia_detalle := nullif(trim(coalesce(v_datos ->> 'incidencia_detalle', '')), '');
  end if;

  update public.entregas_pedidos set
    estado = p_estado,
    estado_desde = now(),
    updated_at = now(),
    impreso_at = v_p.impreso_at,
    impreso_por = v_p.impreso_por,
    bloqueo_motivo = v_p.bloqueo_motivo,
    bloqueo_detalle = v_p.bloqueo_detalle,
    stock_estimado = v_p.stock_estimado,
    fecha_despacho = v_p.fecha_despacho,
    n_guia = v_p.n_guia,
    bultos = v_p.bultos,
    expreso_id = v_p.expreso_id,
    fecha_entrega = v_p.fecha_entrega,
    incidencia_motivo = v_p.incidencia_motivo,
    incidencia_detalle = v_p.incidencia_detalle
  where id = p_pedido
  returning * into v_p;

  insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, de_estado, a_estado, nota, datos)
  values (p_pedido, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'estado', v_de, p_estado,
          nullif(trim(coalesce(p_nota, '')), ''), nullif(v_datos, '{}'::jsonb));

  return v_p;
end;
$$;

-- Edición de datos (cliente, dirección, guía, fechas…). Cualquiera con acceso puede corregir; queda el antes/después.
create or replace function public.entregas_editar(p_pedido uuid, p_campos jsonb)
returns public.entregas_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.entregas_mi_rol();
  v_antes jsonb;
  v_p public.entregas_pedidos;
  v_cambios jsonb := '{}'::jsonb;
  v_clave text;
  v_permitidas text[] := array['n_remito', 'fecha_remito', 'cliente', 'cuit', 'direccion', 'localidad', 'provincia', 'cp',
    'telefono', 'contacto', 'nota', 'expreso_id', 'n_guia', 'bultos', 'fecha_despacho', 'fecha_entrega', 'stock_estimado'];
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
    updated_at = now()
  where p.id = p_pedido
  returning * into v_p;

  insert into public.entregas_eventos (pedido_id, user_id, user_email, tipo, datos)
  values (p_pedido, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'edicion', v_cambios);

  return v_p;
end;
$$;

-- Personas que aparecen en la app (vendedores para filtrar, quién hizo cada cosa).
create or replace function public.entregas_usuarios()
returns table (id uuid, email text, nombre text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    lower(u.email) as email,
    coalesce(
      nullif(r.nombre, ''),
      (select t.name from public.team_members t where lower(t.email) = lower(u.email) limit 1),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      initcap(split_part(u.email, '@', 1))
    ) as nombre,
    case
      when lower(u.email) in ('felipecnokaert@gmail.com', 'felipe@grupopoliplast.com.ar', 'juan@grupopoliplast.com.ar',
                              'diego@grupopoliplast.com.ar', 'cowork@grupopoliplast.com.ar') then 'admin'
      else coalesce(r.rol, 'vendedor')
    end as rol
  from auth.users u
  left join public.entregas_roles r on r.email = lower(u.email)
  where public.entregas_mi_rol() is not null
    and (r.email is not null or lower(u.email) like '%@grupopoliplast.com.ar' or lower(u.email) = 'felipecnokaert@gmail.com')
  order by 3;
$$;

-- ---------------------------------------------------------------- RLS
alter table public.entregas_roles enable row level security;
alter table public.entregas_config enable row level security;
alter table public.entregas_expresos enable row level security;
alter table public.entregas_pedidos enable row level security;
alter table public.entregas_eventos enable row level security;
alter table public.entregas_archivos enable row level security;

drop policy if exists entregas_roles_leer on public.entregas_roles;
create policy entregas_roles_leer on public.entregas_roles for select to authenticated using ((select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_roles_admin on public.entregas_roles;
create policy entregas_roles_admin on public.entregas_roles for all to authenticated
  using ((select public.entregas_mi_rol()) = 'admin') with check ((select public.entregas_mi_rol()) = 'admin');

drop policy if exists entregas_config_leer on public.entregas_config;
create policy entregas_config_leer on public.entregas_config for select to authenticated using ((select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_config_admin on public.entregas_config;
create policy entregas_config_admin on public.entregas_config for update to authenticated
  using ((select public.entregas_mi_rol()) = 'admin') with check ((select public.entregas_mi_rol()) = 'admin');

drop policy if exists entregas_expresos_leer on public.entregas_expresos;
create policy entregas_expresos_leer on public.entregas_expresos for select to authenticated using ((select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_expresos_admin on public.entregas_expresos;
create policy entregas_expresos_admin on public.entregas_expresos for all to authenticated
  using ((select public.entregas_mi_rol()) = 'admin') with check ((select public.entregas_mi_rol()) = 'admin');

drop policy if exists entregas_pedidos_leer on public.entregas_pedidos;
create policy entregas_pedidos_leer on public.entregas_pedidos for select to authenticated using ((select public.entregas_mi_rol()) is not null);
-- Alta: cualquiera con acceso; un vendedor solo a su nombre (expedición/admin pueden cargar por otro).
drop policy if exists entregas_pedidos_alta on public.entregas_pedidos;
create policy entregas_pedidos_alta on public.entregas_pedidos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) in ('admin', 'expedicion')
    or ((select public.entregas_mi_rol()) = 'vendedor' and vendedor_id = (select auth.uid()))
  );
-- Sin UPDATE/DELETE directos: se usa entregas_cambiar_estado / entregas_editar.

drop policy if exists entregas_eventos_leer on public.entregas_eventos;
create policy entregas_eventos_leer on public.entregas_eventos for select to authenticated using ((select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_eventos_comentar on public.entregas_eventos;
create policy entregas_eventos_comentar on public.entregas_eventos for insert to authenticated
  with check (
    (select public.entregas_mi_rol()) is not null
    and tipo = 'comentario'
    and user_id = (select auth.uid())
    and length(trim(coalesce(nota, ''))) > 0
  );

drop policy if exists entregas_archivos_leer on public.entregas_archivos;
create policy entregas_archivos_leer on public.entregas_archivos for select to authenticated using ((select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_archivos_subir on public.entregas_archivos;
create policy entregas_archivos_subir on public.entregas_archivos for insert to authenticated
  with check ((select public.entregas_mi_rol()) is not null and subido_por = (select auth.uid()));
drop policy if exists entregas_archivos_borrar on public.entregas_archivos;
create policy entregas_archivos_borrar on public.entregas_archivos for delete to authenticated
  using (subido_por = (select auth.uid()) or (select public.entregas_mi_rol()) = 'admin');

grant select on public.entregas_pedidos_vista to authenticated;
revoke all on function public.entregas_cambiar_estado(uuid, text, jsonb, text) from public, anon;
revoke all on function public.entregas_editar(uuid, jsonb) from public, anon;
revoke all on function public.entregas_usuarios() from public, anon;
revoke all on function public.entregas_mi_rol() from public, anon;
grant execute on function public.entregas_cambiar_estado(uuid, text, jsonb, text) to authenticated;
grant execute on function public.entregas_editar(uuid, jsonb) to authenticated;
grant execute on function public.entregas_usuarios() to authenticated;
grant execute on function public.entregas_mi_rol() to authenticated;

-- ---------------------------------------------------------------- Storage (bucket privado)
insert into storage.buckets (id, name, public, file_size_limit)
values ('entregas', 'entregas', false, 15728640)
on conflict (id) do nothing;

drop policy if exists entregas_storage_leer on storage.objects;
create policy entregas_storage_leer on storage.objects for select to authenticated
  using (bucket_id = 'entregas' and (select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_storage_subir on storage.objects;
create policy entregas_storage_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and (select public.entregas_mi_rol()) is not null);
drop policy if exists entregas_storage_borrar on storage.objects;
create policy entregas_storage_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'entregas' and (owner = (select auth.uid()) or (select public.entregas_mi_rol()) = 'admin'));

-- ---------------------------------------------------------------- Realtime (listas que se actualizan solas)
do $$
begin
  begin
    alter publication supabase_realtime add table public.entregas_pedidos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.entregas_eventos;
  exception when duplicate_object then null;
  end;
end $$;
