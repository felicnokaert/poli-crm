-- 24/10: alerta cuando un competidor cambia de envío (pasa a Full, a envío gratis, o los deja). Se guarda el tipo de logística
-- actual y, cuando cambia, qué cambió y cuándo (las alertas del CRM miran los últimos 7 días).
alter table public.ml_competitor_items add column if not exists logistic_type text not null default '';
alter table public.ml_competitor_items add column if not exists shipping_change text not null default '';
alter table public.ml_competitor_items add column if not exists shipping_changed_at timestamptz;
