-- Links compartibles del mapa de cobertura (Cartera > Mapa > Compartir).
--
-- Cada fila es una "foto" publicada a proposito por alguien del equipo: los clientes ya
-- sin CUIT, telefonos ni emails (ver src/map-share.mjs, buildPublicSnapshot), mas el hash
-- del link secreto. NUNCA se guarda el link en claro: si alguien leyera esta tabla no podria
-- reconstruir ningun link (el link tiene 256 bits al azar y aca solo esta su SHA-256).
--
-- Lectura publica: solo a traves de api/mapa-publico.js, que usa la service role key, busca
-- por hash y exige revoked_at is null. Los usuarios anonimos NO tienen ninguna policy (RLS
-- los deja afuera de la tabla). Revocar = poner revoked_at; no hay delete.
create table if not exists public.map_shares (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default '',
  options jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  client_count integer not null default 0,
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.map_shares enable row level security;

drop policy if exists map_shares_select on public.map_shares;
create policy map_shares_select on public.map_shares
  for select to authenticated
  using (public.is_poliplast_crm_user());

drop policy if exists map_shares_insert on public.map_shares;
create policy map_shares_insert on public.map_shares
  for insert to authenticated
  with check (public.is_poliplast_crm_user() and created_by = auth.uid());

drop policy if exists map_shares_revoke on public.map_shares;
create policy map_shares_revoke on public.map_shares
  for update to authenticated
  using (public.is_poliplast_crm_user())
  with check (public.is_poliplast_crm_user());
