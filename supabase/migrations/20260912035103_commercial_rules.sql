-- Reconstrucción retroactiva (ver supabase/migrations/README.md).
-- Ya registrada en supabase_migrations.schema_migrations del proyecto remoto
-- (versión 20260912035103, nombre "commercial_rules") sin archivo .sql ni
-- documento .md correspondiente en docs/ (no se encontró ningún ADR/spec que
-- la mencione). Reconstruida íntegramente a partir del esquema real hoy
-- (list_tables verbose + pg_policies) porque no existe fuente documental.
--
-- DISCREPANCIA (ver README): esta es la única migración tracked en el
-- proyecto remoto sin ningún rastro en docs/ - ni .sql ni .md. Confirmar con
-- Felipe el propósito exacto de "reglas comerciales" (parece un mecanismo de
-- precios/mínimos por familia o SKU, similar a variant_prices pero con
-- comparador de cantidad gt/gte y neto/IVA/bruto explícitos) y documentarlo.

create table if not exists public.commercial_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('family', 'sku')),
  family text,
  variant_id uuid references public.catalog_variants(id),
  quantity_comparator text not null check (quantity_comparator in ('gt', 'gte')),
  min_quantity numeric(18,6) not null check (min_quantity > 0),
  net_amount numeric(18,6) not null check (net_amount >= 0),
  vat_rate numeric(18,6) not null check (vat_rate >= 0 and vat_rate <= 1),
  gross_amount numeric(18,6) not null check (gross_amount >= 0),
  currency text not null check (currency in ('ARS', 'USD')),
  unit text not null default 'unidad',
  valid_from date not null default current_date,
  valid_until date,
  source text not null,
  status text not null default 'confirmado' check (status in ('pendiente', 'confirmado', 'vencido', 'excepcion_manual')),
  override_reason text not null default '',
  responsible_user_id uuid references auth.users(id),
  responsible_email text not null default '',
  supersedes_rule_id uuid references public.commercial_rules(id),
  notes text not null default '',
  import_job_id uuid references public.catalog_import_jobs(id),
  created_by uuid references auth.users(id),
  created_by_email text,
  created_at timestamptz not null default now()
);

alter table public.commercial_rules enable row level security;

create policy "Equipo lee reglas comerciales" on public.commercial_rules
for select to authenticated using (public.is_poliplast_crm_user());

create policy "Admin administra reglas comerciales" on public.commercial_rules
for all to authenticated
using (public.is_poliplast_crm_admin())
with check (public.is_poliplast_crm_admin());
