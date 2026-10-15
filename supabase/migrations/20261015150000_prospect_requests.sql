-- Pedidos de investigación de Prospección: la app deja el pedido y Claude (sesión de Felipe,
-- sin costo de API) lo investiga en la web y devuelve una tabla que la app importa.
create table if not exists public.prospect_requests (
  id uuid primary key,
  user_email text not null check (user_email = lower(btrim(user_email))),
  family text not null,
  scope text not null default 'todo el país',
  wanted integer not null default 20,
  notes text not null default '',
  prompt text not null,
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','lista','error')),
  progress text not null default '',
  result_markdown text not null default '',
  result_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospect_requests_user_idx on public.prospect_requests (user_email, created_at desc);
alter table public.prospect_requests enable row level security;
revoke all on public.prospect_requests from anon;
grant select, insert on public.prospect_requests to authenticated;
-- Cada persona ve y crea solo sus pedidos. Quien procesa (service role / panel de Supabase) saltea la RLS.
create policy prospect_requests_select_own on public.prospect_requests for select to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy prospect_requests_insert_own on public.prospect_requests for insert to authenticated
  with check (user_email = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'pendiente');
