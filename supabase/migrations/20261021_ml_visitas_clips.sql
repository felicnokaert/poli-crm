-- Visitas por publicación (7 y 30 días) y cantidad de clips (21/10). Solo agrega columnas.
alter table public.ml_items
  add column if not exists visits_7d integer,
  add column if not exists visits_30d integer,
  add column if not exists clips_count integer,
  add column if not exists extras_checked_at timestamptz;
