-- 24/10: Centro de mejoras. Una foto por día y por problema de cada canal (Mercado Libre, Shopify) para ver cómo baja
-- lo que hay que limpiar. Lee todo el equipo; escribe solo el administrador (como ml_competition_reports).
create table if not exists public.improvement_snapshots (
  day date not null,
  channel text not null,
  issue text not null,
  count integer not null default 0,
  total integer not null default 0,
  primary key (day, channel, issue)
);
alter table public.improvement_snapshots enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'improvement_snapshots' and policyname = 'improvement_snapshots_read') then
    create policy improvement_snapshots_read on public.improvement_snapshots for select to authenticated using (public.is_poliplast_crm_user());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'improvement_snapshots' and policyname = 'improvement_snapshots_insert') then
    create policy improvement_snapshots_insert on public.improvement_snapshots for insert to authenticated with check (public.is_poliplast_channel_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'improvement_snapshots' and policyname = 'improvement_snapshots_update') then
    create policy improvement_snapshots_update on public.improvement_snapshots for update to authenticated using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());
  end if;
end $$;
