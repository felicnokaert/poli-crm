-- 23/10: calidad (GET /item/{id}/performance) y experiencia de compra (purchase_experience) de cada
-- publicación de Mercado Libre. Escribe solo la clave de servicio (api/admin-users.js); el equipo lee.
create table if not exists public.ml_item_health (
  id text primary key,
  seller_id text not null,
  quality_score numeric,
  quality_level text,
  quality_pending jsonb not null default '[]'::jsonb,
  raw_quality jsonb,
  px_color text,
  px_score numeric,
  px_label text,
  px_problems jsonb not null default '[]'::jsonb,
  raw_px jsonb,
  checked_at timestamptz not null default now()
);
create index if not exists ml_item_health_seller on public.ml_item_health (seller_id, checked_at);
alter table public.ml_item_health enable row level security;
create policy ml_item_health_read on public.ml_item_health for select to authenticated using (public.is_poliplast_crm_user());
