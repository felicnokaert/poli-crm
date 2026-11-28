-- 28/11: facturas hechas desde Mercado Libre / Mercado Pago, aparte de contabilium_comprobantes (sin datos del comprador).
create table if not exists public.contabilium_comprobantes_ml (
  company text not null,
  id text not null,
  tipo text,
  numero text,
  fecha date,
  origen text,
  moneda text,
  tc text,
  total numeric,
  synced_at timestamptz not null default now(),
  primary key (company, id)
);
create index if not exists contabilium_comprobantes_ml_fecha on public.contabilium_comprobantes_ml (company, fecha);
alter table public.contabilium_comprobantes_ml enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contabilium_comprobantes_ml' and policyname = 'contabilium_comprobantes_ml_read') then
    create policy contabilium_comprobantes_ml_read on public.contabilium_comprobantes_ml for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
alter table public.contabilium_items add column if not exists canal text;
