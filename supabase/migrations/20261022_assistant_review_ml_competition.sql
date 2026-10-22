-- 22/10 (pedido de Felipe): panel para revisar los 👎 del asistente y reportes de competencia pegados desde
-- Mercado Libre (Métricas → Competencia / mejores vendedores; la API no los entrega). Nada se borra.

-- 👎 resueltos: Felipe marca el voto como revisado (corregido o descartado).
alter table public.assistant_feedback add column if not exists resolved_at timestamptz;
alter table public.assistant_feedback add column if not exists resolution text not null default '';
create policy assistant_feedback_resolve on public.assistant_feedback for update to authenticated
  using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());

-- Lo que Felipe pega de Mercado Libre. Lo lee todo el equipo (y el asistente); solo Felipe carga o borra.
create table if not exists public.ml_competition_reports (
  id uuid primary key default gen_random_uuid(),
  account text not null default '',
  section text not null default '',
  content text not null,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
alter table public.ml_competition_reports enable row level security;
create policy ml_competition_reports_read on public.ml_competition_reports for select to authenticated using (public.is_poliplast_crm_user());
create policy ml_competition_reports_insert on public.ml_competition_reports for insert to authenticated with check (public.is_poliplast_channel_admin());
create policy ml_competition_reports_delete on public.ml_competition_reports for delete to authenticated using (public.is_poliplast_channel_admin());
