-- Mercado Libre como conocimiento (20/10). Solo lectura de lo propio: publicaciones y preguntas respondidas.

-- Cuentas conectadas y sus tokens: SIN políticas, así que solo la clave de servicio (servidor) las lee.
create table if not exists public.ml_accounts (
  seller_id text primary key,
  nickname text not null default '',
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_by_email text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ml_accounts enable row level security;

create table if not exists public.ml_items (
  id text primary key,
  seller_id text not null,
  title text not null default '',
  permalink text not null default '',
  status text not null default '',
  price numeric,
  currency text not null default '',
  category_id text not null default '',
  sold_quantity integer,
  attributes jsonb not null default '[]'::jsonb,
  description text not null default '',
  synced_at timestamptz not null default now()
);
alter table public.ml_items enable row level security;
create policy ml_items_read on public.ml_items for select to authenticated using (public.is_poliplast_crm_user());

create table if not exists public.ml_questions (
  id text primary key,
  seller_id text not null,
  item_id text not null default '',
  question text not null,
  answer text not null,
  asked_at timestamptz,
  answered_at timestamptz,
  synced_at timestamptz not null default now()
);
alter table public.ml_questions enable row level security;
create policy ml_questions_read on public.ml_questions for select to authenticated using (public.is_poliplast_crm_user());

create index if not exists ml_items_fts on public.ml_items using gin (to_tsvector('spanish', title || ' ' || description));
create index if not exists ml_questions_fts on public.ml_questions using gin (to_tsvector('spanish', question || ' ' || answer));

-- Búsqueda en castellano (sin acentos ni plurales) sobre publicaciones y preguntas. Respeta RLS.
create or replace function public.search_ml_knowledge(q text, max_rows integer default 12)
returns table (kind text, id text, title text, body text, permalink text, rank real)
language sql stable security invoker set search_path = public as $$
  with query as (select websearch_to_tsquery('spanish', coalesce(q, '')) as tsq)
  (select 'pregunta', mq.id, coalesce(mi.title, ''), 'Pregunta: ' || mq.question || E'\nRespuesta: ' || mq.answer, coalesce(mi.permalink, ''),
          ts_rank(to_tsvector('spanish', mq.question || ' ' || mq.answer), query.tsq)
     from ml_questions mq left join ml_items mi on mi.id = mq.item_id, query
    where to_tsvector('spanish', mq.question || ' ' || mq.answer) @@ query.tsq
    order by 6 desc limit greatest(1, least(max_rows, 50)))
  union all
  (select 'publicacion', mi.id, mi.title, left(mi.description, 1500), mi.permalink,
          ts_rank(to_tsvector('spanish', mi.title || ' ' || mi.description), query.tsq)
     from ml_items mi, query
    where to_tsvector('spanish', mi.title || ' ' || mi.description) @@ query.tsq
    order by 6 desc limit greatest(1, least(max_rows, 50)))
$$;
grant execute on function public.search_ml_knowledge(text, integer) to authenticated;
