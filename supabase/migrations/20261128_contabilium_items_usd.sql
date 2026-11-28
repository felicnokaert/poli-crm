-- 28/11: renglones en dólares (moneda del comprobante, dólar del día y neto en USD).
alter table public.contabilium_items add column if not exists moneda text, add column if not exists tc numeric, add column if not exists neto_usd numeric;
