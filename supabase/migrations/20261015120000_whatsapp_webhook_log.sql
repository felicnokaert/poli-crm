-- Registro de cada llamada que recibe /api/whatsapp-webhook (sin texto de mensajes ni datos personales).
-- Sirve para saber si Meta deja de llamar al CRM: los logs de Vercel Hobby duran solo 1 hora.
create table if not exists public.whatsapp_webhook_log (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  method text not null,
  outcome text not null,
  status_code integer,
  body_bytes integer,
  has_signature boolean,
  summary jsonb
);
create index if not exists whatsapp_webhook_log_received_at_idx on public.whatsapp_webhook_log (received_at desc);
alter table public.whatsapp_webhook_log enable row level security;
-- Sin políticas: solo el service_role (servidor) lee y escribe.
