# SQL pendiente del 23/10 (pegar una sola vez)

Claude no tiene permiso en Supabase en este momento, así que hay que pegarlo a mano:

1. Entrá a supabase.com → proyecto nghwmtccpovrdtzvllwe → **SQL Editor** → **New query**.
2. Pegá todo el bloque de abajo y tocá **Run**.
3. Después, en el CRM: Más → Datos → Mercado Libre → **Actualizar** en cada cuenta (trae la calidad de las publicaciones).

Qué hace (no borra ni cambia nada existente):
- `team_shared_notes`: lo que anota cada uno se comparte (OK de Felipe: "está bien que el asistente aprenda de todos"). Cada cuenta escribe y borra solo lo suyo; todo el equipo lee.
- `ml_item_health`: calidad y experiencia de compra de cada publicación de Mercado Libre.
- `ml_competitor_items`, `ml_competitor_snapshots`, `ml_trends`: seguimiento de la competencia (precio y vendidas por día) y tendencias de búsqueda.

Las de Mercado Libre las escribe solo el servidor; el equipo las lee.

```sql
-- 23/10 (OK de Felipe: "está bien que el asistente aprenda de todos"): lo que anota cada persona (Historial,
-- notas de clientes y prospectos, resultados de la Cola del día) se copia acá para que el asistente y el
-- resumen semanal aprendan de todo el equipo. Cada cuenta escribe y borra SOLO lo suyo; todo el equipo lee.
-- Lo arma el navegador de cada persona desde su espacio de trabajo (src/team-shared-notes.mjs).
create table if not exists public.team_shared_notes (
  id text primary key,
  author_email text not null,
  author_name text not null default '',
  kind text not null,          -- historial | nota-cliente | nota-prospecto | contacto
  company text not null default '',
  note text not null default '',
  outcome text not null default '',
  noted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists team_shared_notes_noted on public.team_shared_notes (noted_at desc);
create index if not exists team_shared_notes_author on public.team_shared_notes (author_email, synced_at);
alter table public.team_shared_notes enable row level security;
create policy team_shared_notes_read on public.team_shared_notes for select to authenticated
  using (public.is_poliplast_crm_user());
create policy team_shared_notes_insert on public.team_shared_notes for insert to authenticated
  with check (public.is_poliplast_crm_user() and author_email = lower(auth.jwt() ->> 'email'));
create policy team_shared_notes_update on public.team_shared_notes for update to authenticated
  using (author_email = lower(auth.jwt() ->> 'email'))
  with check (author_email = lower(auth.jwt() ->> 'email'));
create policy team_shared_notes_delete on public.team_shared_notes for delete to authenticated
  using (author_email = lower(auth.jwt() ->> 'email'));

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

-- 23/10: seguimiento de la competencia y tendencias de Mercado Libre (lib/ml-competition.mjs). Escribe solo
-- la clave de servicio (Felipe carga desde el CRM vía api/admin-users.js); el equipo lee.
create table if not exists public.ml_competitor_items (
  id text primary key,
  seller_id text not null default '',
  seller_nickname text not null default '',
  competitor_name text not null default '',
  our_item_id text not null default '',
  title text not null default '',
  permalink text not null default '',
  price numeric,
  original_price numeric,
  currency text not null default '',
  sold_quantity integer,
  available_quantity integer,
  status text not null default '',
  thumbnail text not null default '',
  category_id text not null default '',
  free_shipping boolean,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  checked_at timestamptz not null default now()
);
create table if not exists public.ml_competitor_snapshots (
  item_id text not null,
  taken_on date not null,
  price numeric,
  sold_quantity integer,
  available_quantity integer,
  status text not null default '',
  primary key (item_id, taken_on)
);
create table if not exists public.ml_trends (
  category_id text not null,
  taken_on date not null,
  category_name text not null default '',
  path text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  primary key (category_id, taken_on)
);
alter table public.ml_competitor_items enable row level security;
alter table public.ml_competitor_snapshots enable row level security;
alter table public.ml_trends enable row level security;
create policy ml_competitor_items_read on public.ml_competitor_items for select to authenticated using (public.is_poliplast_crm_user());
create policy ml_competitor_snapshots_read on public.ml_competitor_snapshots for select to authenticated using (public.is_poliplast_crm_user());
create policy ml_trends_read on public.ml_trends for select to authenticated using (public.is_poliplast_crm_user());

```
