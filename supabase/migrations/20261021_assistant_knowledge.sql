-- Asistente (21/10, OK de Felipe): lo que Felipe le "enseña" al asistente. Una respuesta validada va
-- primero, antes que Mercado Libre y las fichas, en el buscador y en la IA. Todo el equipo la lee; solo
-- Felipe (is_poliplast_channel_admin) la crea, cambia o borra.
create table if not exists public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  product text not null default '',
  answer text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_knowledge enable row level security;
create policy assistant_knowledge_read on public.assistant_knowledge for select to authenticated using (public.is_poliplast_crm_user());
create policy assistant_knowledge_insert on public.assistant_knowledge for insert to authenticated with check (public.is_poliplast_channel_admin());
create policy assistant_knowledge_update on public.assistant_knowledge for update to authenticated using (public.is_poliplast_channel_admin()) with check (public.is_poliplast_channel_admin());
create policy assistant_knowledge_delete on public.assistant_knowledge for delete to authenticated using (public.is_poliplast_channel_admin());

-- 👍 / 👎 de cada respuesta: cualquiera del equipo vota; solo Felipe lee los votos para corregir.
create table if not exists public.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null default '',
  source text not null default '',
  vote smallint not null check (vote in (-1, 1)),
  email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
alter table public.assistant_feedback enable row level security;
create policy assistant_feedback_insert on public.assistant_feedback for insert to authenticated with check (public.is_poliplast_crm_user());
create policy assistant_feedback_read on public.assistant_feedback for select to authenticated using (public.is_poliplast_channel_admin());
