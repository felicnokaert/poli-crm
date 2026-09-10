-- Base de conocimiento técnica: catálogo compartido de documentos (índice y
-- estado, nunca copia del archivo original - ver docs/BASE_CONOCIMIENTO_TECNICA_SPEC.md).
-- Migración exclusivamente aditiva: no altera ni borra tablas/columnas existentes.
-- Ejecutar una sola vez en Supabase.

-- Rol autorizado para la única acción privilegiada de este bloque: marcar un
-- documento como "vigente". El resto de las operaciones (importar, revisar,
-- pasar a pendiente_validacion/desactualizado/no_tecnico/posible_duplicado)
-- están disponibles para cualquier usuario corporativo, igual que el resto
-- del CRM. No existe todavía una tabla de roles (admin/supervisor/vendedor
-- sigue en roadmap, ver docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md Sección 9) - este
-- gate reutiliza el mismo criterio que ya usan api/commercial-master.js y
-- api/meta-subscribe.js para su única acción privilegiada análoga.
create or replace function public.is_poliplast_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in ('felipecnokaert@gmail.com', 'felipe@grupopoliplast.com.ar');
$$;

revoke all on function public.is_poliplast_crm_admin() from public;
grant execute on function public.is_poliplast_crm_admin() to authenticated;

-- Catálogo técnico compartido a nivel Grupo Poliplast. Deliberadamente sin
-- columna de canal/unidad de negocio: General, Penosil y Juan leen la misma
-- fila: no se duplica una ficha por canal (docs/ADR-001, "no se copiarán
-- fichas por General/Penosil/Juan").
create table if not exists public.technical_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  family text not null,
  product text not null default '',
  sku text not null default '',
  doc_type text not null default 'sin_clasificar',
  source text not null default 'drive' check (source in ('drive', 'other')),
  source_url text not null default '',
  source_file text not null default '',
  source_updated_at timestamptz,
  version text,
  language text,
  sha256 text,
  size_bytes bigint,
  status text not null default 'inventariado' check (
    status in ('inventariado', 'posible_duplicado', 'pendiente_validacion', 'vigente', 'desactualizado', 'no_tecnico')
  ),
  verified_by uuid references auth.users(id) on delete set null,
  verified_by_email text,
  verified_at timestamptz,
  replaced_by uuid references public.technical_documents(id) on delete set null,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ningún documento puede quedar "vigente" sin responsable y fecha de
  -- validación - la regla no depende solo del código de la app (Sección 5
  -- de la spec: "un dato técnico solo puede citarse si el documento está
  -- vigente, tiene fuente, responsable y fecha de validación").
  constraint technical_documents_vigente_requiere_validacion check (
    status <> 'vigente' or (verified_by is not null and verified_at is not null)
  )
);

create index if not exists technical_documents_family_idx on public.technical_documents (family);
create index if not exists technical_documents_status_idx on public.technical_documents (status);
create index if not exists technical_documents_sha256_idx on public.technical_documents (sha256);

-- Historial de validación: cada cambio de estado queda auditado (usuario,
-- fecha, estado anterior, estado nuevo, observación), nunca sobreescrito.
create table if not exists public.technical_document_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.technical_documents(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  note text not null default '',
  changed_at timestamptz not null default now()
);

create index if not exists technical_document_history_document_idx on public.technical_document_history (document_id);

-- El registro de auditoría lo escribe el trigger, no la aplicación - así
-- ningún cambio de estado puede quedar sin loguear aunque un cambio futuro
-- de la app se olvide de llamarlo a mano.
create or replace function public.log_technical_document_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.technical_document_history (document_id, previous_status, new_status, changed_by, changed_by_email, note)
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      auth.uid(),
      lower(coalesce(auth.jwt() ->> 'email', '')),
      coalesce(new.notes, '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists technical_documents_log_status_change on public.technical_documents;
create trigger technical_documents_log_status_change
after insert or update on public.technical_documents
for each row execute function public.log_technical_document_status_change();

alter table public.technical_documents enable row level security;
alter table public.technical_document_history enable row level security;

-- Cualquier usuario corporativo lee el catálogo completo (compartido, no por
-- canal) y la auditoría completa.
create policy "Equipo Poliplast lee documentos tecnicos" on public.technical_documents
for select to authenticated using (public.is_poliplast_crm_user());

create policy "Equipo Poliplast lee historial tecnico" on public.technical_document_history
for select to authenticated using (public.is_poliplast_crm_user());

-- Importar (insertar) solo puede dejar un documento en inventariado o
-- pendiente_validacion - nunca vigente al crearse (Sección 5, punto 5 del
-- pedido: "el estado inicial de todo lo importado es inventariado o
-- pendiente_validacion, nunca vigente").
create policy "Equipo Poliplast inventaria documentos tecnicos" on public.technical_documents
for insert to authenticated with check (
  public.is_poliplast_crm_user()
  and status in ('inventariado', 'pendiente_validacion')
);

-- Actualizar: cualquier usuario corporativo puede mover un documento entre
-- estados no privilegiados; marcarlo "vigente" requiere el rol autorizado.
-- El check de la tabla (mas arriba) exige ademas responsable y fecha.
create policy "Equipo Poliplast revisa documentos tecnicos" on public.technical_documents
for update to authenticated
using (public.is_poliplast_crm_user())
with check (
  public.is_poliplast_crm_user()
  and (status <> 'vigente' or public.is_poliplast_crm_admin())
);

-- Sin política de DELETE a propósito: "ningún documento se borra o mueve
-- durante la auditoría" (Sección 5 de la spec). Solo accesible via
-- service_role fuera de la app, para un caso excepcional.
revoke delete on public.technical_documents from authenticated;
revoke insert, update, delete on public.technical_document_history from authenticated;

-- Endurecimiento (aplicado 10/09/2026 tras revisar los advisors de
-- seguridad de Supabase): la función de trigger no debe ser invocable
-- directamente via RPC por anon/authenticated, solo por el trigger mismo;
-- is_poliplast_crm_admin no debe ser ejecutable por anon.
revoke execute on function public.log_technical_document_status_change() from public, anon, authenticated;
revoke execute on function public.is_poliplast_crm_admin() from anon;
