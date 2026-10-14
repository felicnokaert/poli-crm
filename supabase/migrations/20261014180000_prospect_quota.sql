-- Tope diario de consultas a Google Places para la Prospección (adaptador OFF por defecto).
-- NO aplicada todavía: se aplica recién si se decide activar el adaptador.
create table if not exists public.prospect_quota (
  day date primary key,
  used integer not null default 0 check (used >= 0)
);
alter table public.prospect_quota enable row level security;

-- Toma un cupo de forma atómica: devuelve true si había lugar, false si se alcanzó el tope.
create or replace function public.prospect_quota_take(p_day date, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare taken integer;
begin
  insert into public.prospect_quota(day, used) values (p_day, 0) on conflict (day) do nothing;
  update public.prospect_quota set used = used + 1 where day = p_day and used < p_cap returning used into taken;
  return taken is not null;
end;
$$;

revoke all on function public.prospect_quota_take(date, integer) from public, anon, authenticated;
grant execute on function public.prospect_quota_take(date, integer) to service_role;
