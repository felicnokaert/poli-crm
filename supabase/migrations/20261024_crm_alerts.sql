-- 24/10: alertas persistentes. Las escribe el servidor después de las actualizaciones de cada día (nada se actúa solo):
-- una fila por (tipo, entidad) con desde cuándo está y cuántos días seguidos lleva. Las que se arreglan quedan con resolved_at.
create table if not exists public.crm_alerts (
  type text not null,
  entity_id text not null default '',
  severity text not null default 'media',
  source text not null default '',
  title text not null default '',
  detail text not null default '',
  link jsonb not null default '{}'::jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  runs_active integer not null default 1,
  resolved_at timestamptz,
  primary key (type, entity_id)
);
create index if not exists crm_alerts_open on public.crm_alerts (resolved_at, severity);
alter table public.crm_alerts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_alerts' and policyname = 'crm_alerts_read') then
    create policy crm_alerts_read on public.crm_alerts for select to authenticated using (public.is_poliplast_crm_user());
  end if;
end $$;
