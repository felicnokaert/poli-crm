-- 24/10: permisos por módulo y submódulo. Por defecto todos ven todo; acá se anotan solo las excepciones (allowed = false).
-- Cada persona lee lo suyo; lee y escribe todo el administrador.
create table if not exists public.module_access (
  email text not null,
  module text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (email, module)
);
alter table public.module_access enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'module_access' and policyname = 'module_access_select') then
    create policy module_access_select on public.module_access for select to authenticated
      using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_poliplast_channel_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'module_access' and policyname = 'module_access_write') then
    create policy module_access_write on public.module_access for all to authenticated
      using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());
  end if;
end $$;
