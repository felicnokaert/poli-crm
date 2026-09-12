-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Origen: docs/MIGRACION_ACCESO_CORPORATIVO.sql (commit ec91eec, 2026-08-29
-- 01:07:46 -0300, "feat: preparar acceso corporativo al CRM").
-- Acceso privado del CRM: usuarios previamente habilitados en Supabase Auth.
-- Se admite el dominio corporativo y se conserva el Gmail de Felipe como respaldo.

create or replace function public.is_poliplast_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'felipecnokaert@gmail.com'
    or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@grupopoliplast.com.ar';
$$;

revoke all on function public.is_poliplast_crm_user() from public;
grant execute on function public.is_poliplast_crm_user() to authenticated;

drop policy if exists "Felipe opera cuentas" on public.accounts;
drop policy if exists "Felipe opera contactos" on public.contacts;
drop policy if exists "Felipe opera conversaciones" on public.conversations;
drop policy if exists "Felipe opera tareas" on public.tasks;
drop policy if exists "Felipe opera evaluaciones" on public.evaluations;
drop policy if exists "Felipe opera respuestas" on public.quick_reply_templates;
drop policy if exists "Felipe lee eventos" on public.whatsapp_events;
drop policy if exists "Felipe sincroniza su estado" on public.copilot_states;

create policy "Equipo Poliplast opera cuentas" on public.accounts
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast opera contactos" on public.contacts
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast opera conversaciones" on public.conversations
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast opera tareas" on public.tasks
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast opera evaluaciones" on public.evaluations
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast opera respuestas" on public.quick_reply_templates
for all to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
create policy "Equipo Poliplast lee eventos" on public.whatsapp_events
for select to authenticated using (public.is_poliplast_crm_user());
create policy "Equipo Poliplast sincroniza su estado" on public.copilot_states
for all to authenticated
using (auth.uid() = user_id and public.is_poliplast_crm_user())
with check (auth.uid() = user_id and public.is_poliplast_crm_user());
