-- Tablero de Mercado Libre (21/10): más datos de cada publicación para ver estado, video, fotos y calidad.
-- Solo agrega columnas (no borra ni cambia nada de lo que ya está).
alter table public.ml_items
  add column if not exists sub_status jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists video_id text,
  add column if not exists pictures_count integer,
  add column if not exists health numeric,
  add column if not exists listing_type text not null default '',
  add column if not exists available_quantity integer,
  add column if not exists thumbnail text not null default '',
  add column if not exists item_created_at timestamptz,
  add column if not exists item_updated_at timestamptz,
  add column if not exists description_length integer generated always as (length(description)) stored;

alter table public.ml_accounts add column if not exists last_refresh_at timestamptz;

-- Nombre de cada cuenta para el tablero (los tokens siguen sin poder leerse desde el navegador).
create or replace function public.ml_account_names()
returns table (seller_id text, nickname text, last_sync_at timestamptz, last_refresh_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.seller_id, a.nickname, a.last_sync_at, a.last_refresh_at from ml_accounts a
   where public.is_poliplast_crm_user() order by a.nickname
$$;
revoke all on function public.ml_account_names() from public, anon;
grant execute on function public.ml_account_names() to authenticated;

-- Resumen diario de cada cuenta (ventas, visitas, preguntas sin responder, reputación): una fila por día,
-- así se ve la evolución. Solo totales, sin datos de compradores. Lo escribe el servidor; lo lee el equipo.
create table if not exists public.ml_account_metrics (
  seller_id text not null,
  taken_on date not null,
  data jsonb not null default '{}'::jsonb,
  taken_at timestamptz not null default now(),
  primary key (seller_id, taken_on)
);
alter table public.ml_account_metrics enable row level security;
create policy ml_account_metrics_read on public.ml_account_metrics for select to authenticated using (public.is_poliplast_crm_user());
