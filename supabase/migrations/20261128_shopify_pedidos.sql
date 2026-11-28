-- 28/11 (Felipe): cada pedido nuevo de Shopify aparece en Entregas como tarjeta verde con los pasos
-- Factura → Remito → Producción; se cierra al marcar el remito. Lo escribe el servidor (aviso de Shopify o
-- la actualización diaria como respaldo); el equipo solo puede marcar los pasos.
create table if not exists public.shopify_pedidos (
  id text primary key,                      -- gid del pedido en Shopify
  name text not null default '',            -- #1180
  created_at timestamptz not null,
  total numeric,
  currency text not null default '',
  delivery text not null default '',        -- SHIPPING | PICK_UP
  shipping_title text not null default '',
  items jsonb not null default '[]'::jsonb, -- [{ sku, title, qty, price }]
  cliente jsonb not null default '{}'::jsonb, -- { nombre, telefono, email, direccion, localidad, provincia, cp } si Shopify lo manda
  cancelado boolean not null default false,
  factura_at timestamptz,
  remito_at timestamptz,
  produccion_at timestamptz,
  pasos_por text,
  avisado_at timestamptz,                   -- cuándo salió el mail a Brenda e info@
  received_at timestamptz not null default now()
);
create index if not exists shopify_pedidos_abiertos on public.shopify_pedidos (created_at desc) where remito_at is null;
alter table public.shopify_pedidos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopify_pedidos' and policyname = 'shopify_pedidos_read') then
    create policy shopify_pedidos_read on public.shopify_pedidos for select to authenticated using (public.is_poliplast_crm_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shopify_pedidos' and policyname = 'shopify_pedidos_pasos') then
    create policy shopify_pedidos_pasos on public.shopify_pedidos for update to authenticated using (public.is_poliplast_crm_user()) with check (public.is_poliplast_crm_user());
  end if;
end $$;

-- El equipo solo toca los pasos (no el pedido).
revoke insert, update, delete on public.shopify_pedidos from anon, authenticated;
grant select on public.shopify_pedidos to authenticated;
grant update (factura_at, remito_at, produccion_at, pasos_por) on public.shopify_pedidos to authenticated;

-- Tiempo real para que la tarjeta aparezca sola en Entregas.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopify_pedidos') then
    alter publication supabase_realtime add table public.shopify_pedidos;
  end if;
exception when undefined_object then null;
end $$;
