-- Integración oficial Mercado Libre. Ejecutar una sola vez en Supabase.
-- Los tokens se cifran en el servidor antes de persistirse y nunca se exponen al navegador.

create table if not exists mercadolibre_accounts (
  id uuid primary key default gen_random_uuid(),
  account_key text not null unique check (account_key in ('poliplast', 'foam')),
  account_label text not null,
  seller_id text not null unique,
  nickname text,
  site_id text not null default 'MLA',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  status text not null default 'connected' check (status in ('connected', 'reauthorization_required', 'disabled')),
  connected_by uuid references auth.users(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mercadolibre_items (
  account_id uuid not null references mercadolibre_accounts(id) on delete cascade,
  item_id text not null,
  title text not null,
  status text not null,
  category_id text,
  available_quantity integer,
  sold_quantity integer,
  permalink text,
  thumbnail text,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (account_id, item_id)
);

alter table mercadolibre_accounts enable row level security;
alter table mercadolibre_items enable row level security;
revoke all on mercadolibre_accounts, mercadolibre_items from anon, authenticated;
