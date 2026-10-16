-- ESTADO: la tabla shared_companies y sus políticas YA están aplicadas en Supabase (migración beta_equipo).
-- PENDIENTE de confirmación de Felipe: el reemplazo de las políticas de conversation_assignments (sección final),
-- porque la herramienta pidió confirmación para borrar y reemplazar políticas.
-- Beta para el equipo: directorio compartido de empresas (sin datos comerciales privados) y
-- cierre de un hueco de la Bandeja del equipo: las asignaciones solo se ven y se editan en los
-- canales de WhatsApp a los que cada persona pertenece (el administrador de canales ve todos).
create table if not exists public.shared_companies (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_email text not null default ''
);
alter table public.shared_companies enable row level security;
revoke all on public.shared_companies from anon;
grant select, insert, update, delete on public.shared_companies to authenticated;
drop policy if exists shared_companies_read on public.shared_companies;
drop policy if exists shared_companies_admin on public.shared_companies;
create policy shared_companies_read on public.shared_companies for select to authenticated using (public.is_poliplast_crm_user());
create policy shared_companies_admin on public.shared_companies for all to authenticated using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());

drop policy if exists conversation_assignments_read on public.conversation_assignments;
drop policy if exists conversation_assignments_write on public.conversation_assignments;
create policy conversation_assignments_read on public.conversation_assignments for select to authenticated
  using (public.is_poliplast_crm_user() and (public.is_poliplast_channel_admin() or channel = any (public.user_allowed_channels())));
create policy conversation_assignments_write on public.conversation_assignments for all to authenticated
  using (public.is_poliplast_crm_user() and (public.is_poliplast_channel_admin() or channel = any (public.user_allowed_channels())))
  with check (public.is_poliplast_crm_user() and (public.is_poliplast_channel_admin() or channel = any (public.user_allowed_channels())));
