-- Poliplast App (25/11, rama de prueba; SIN APLICAR hasta que Felipe diga «pasamos»): el rol de cada persona.
-- El rol es un conjunto de módulos (src/poliplast-app-plan.mjs ROLES). Encima, module_access sigue guardando lo que
-- Felipe le quita o le suma a cada uno. Una fila puede existir antes de que la persona se registre: así Felipe
-- «crea» la cuenta (mail + rol) y cuando entra con ese mail ya ve lo que le corresponde.
create table if not exists public.app_user_roles (
  email text primary key,
  role text not null check (role in ('admin', 'comercial', 'deposito', 'expedicion', 'administrativo')),
  full_name text not null default '',
  created_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_user_roles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_user_roles' and policyname = 'app_user_roles_select') then
    create policy app_user_roles_select on public.app_user_roles for select to authenticated
      using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select public.is_poliplast_channel_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_user_roles' and policyname = 'app_user_roles_write') then
    create policy app_user_roles_write on public.app_user_roles for all to authenticated
      using ((select public.is_poliplast_channel_admin())) with check ((select public.is_poliplast_channel_admin()));
  end if;
end $$;
