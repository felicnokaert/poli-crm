-- 31/10: enviar mails desde la casilla de cada persona con la Gmail API (etapa 3 del plan estilo Harvey).
-- Las dos tablas son SOLO del servidor (RLS activa y sin políticas): el navegador pide todo por /api/admin-users.
create table if not exists public.gmail_accounts (
  email text primary key,
  refresh_token text not null,
  connected_at timestamptz not null default now(),
  paused boolean not null default false,
  last_error text not null default ''
);
alter table public.gmail_accounts enable row level security;

create table if not exists public.gmail_sends (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  item_id text not null,
  to_email text not null,
  company text not null default '',
  step integer not null default 1,
  subject text not null default '',
  gmail_id text not null default '',
  thread_id text not null default '',
  sent_at timestamptz not null default now(),
  reply_kind text,
  reply_at timestamptz,
  reply_snippet text not null default '',
  reply_emails text[] not null default '{}',
  unique (from_email, item_id)
);
create index if not exists gmail_sends_sent on public.gmail_sends (from_email, sent_at);
create index if not exists gmail_sends_open on public.gmail_sends (from_email) where reply_kind is null;
alter table public.gmail_sends enable row level security;
