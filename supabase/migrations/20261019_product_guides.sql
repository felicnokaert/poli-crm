-- Guias por producto para Academia (19/10). Borradores armados SOLO con el texto de las fichas
-- tecnicas validadas; cada dato lleva su fuente. Las lee todo el equipo; solo Felipe (admin de
-- canales) las carga, edita, valida y borra.
create table if not exists public.product_guides (
  id text primary key,
  family text not null,
  product text not null,
  summary text not null default '',
  sections jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'borrador' check (status in ('borrador', 'validada')),
  validated_by_email text,
  validated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.product_guides enable row level security;

create policy product_guides_read on public.product_guides for select to authenticated
  using (public.is_poliplast_crm_user());
create policy product_guides_admin_insert on public.product_guides for insert to authenticated
  with check (public.is_poliplast_channel_admin());
create policy product_guides_admin_update on public.product_guides for update to authenticated
  using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());
create policy product_guides_admin_delete on public.product_guides for delete to authenticated
  using (public.is_poliplast_channel_admin());
