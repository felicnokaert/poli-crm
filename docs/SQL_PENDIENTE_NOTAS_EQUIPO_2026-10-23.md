# SQL pendiente: notas compartidas del equipo (23/10)

Felipe dio el OK ("está bien que el asistente aprenda de todos"). Claude no tiene permiso en Supabase en este momento, así que hay que pegarlo a mano:

1. Entrá a supabase.com → proyecto nghwmtccpovrdtzvllwe → **SQL Editor** → **New query**.
2. Pegá todo el bloque de abajo y tocá **Run**.
3. Listo: desde ese momento, cada vez que alguien abre el CRM, lo que anotó se comparte solo (a los 30 s).

Qué hace: crea la tabla `team_shared_notes`. Cada cuenta escribe y borra solo lo suyo; todo el equipo lee. No borra ni cambia nada existente.

```sql
-- 23/10 (OK de Felipe: "está bien que el asistente aprenda de todos"): lo que anota cada persona (Historial,
-- notas de clientes y prospectos, resultados de la Cola del día) se copia acá para que el asistente y el
-- resumen semanal aprendan de todo el equipo. Cada cuenta escribe y borra SOLO lo suyo; todo el equipo lee.
-- Lo arma el navegador de cada persona desde su espacio de trabajo (src/team-shared-notes.mjs).
create table if not exists public.team_shared_notes (
  id text primary key,
  author_email text not null,
  author_name text not null default '',
  kind text not null,          -- historial | nota-cliente | nota-prospecto | contacto
  company text not null default '',
  note text not null default '',
  outcome text not null default '',
  noted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists team_shared_notes_noted on public.team_shared_notes (noted_at desc);
create index if not exists team_shared_notes_author on public.team_shared_notes (author_email, synced_at);
alter table public.team_shared_notes enable row level security;
create policy team_shared_notes_read on public.team_shared_notes for select to authenticated
  using (public.is_poliplast_crm_user());
create policy team_shared_notes_insert on public.team_shared_notes for insert to authenticated
  with check (public.is_poliplast_crm_user() and author_email = lower(auth.jwt() ->> 'email'));
create policy team_shared_notes_update on public.team_shared_notes for update to authenticated
  using (author_email = lower(auth.jwt() ->> 'email'))
  with check (author_email = lower(auth.jwt() ->> 'email'));
create policy team_shared_notes_delete on public.team_shared_notes for delete to authenticated
  using (author_email = lower(auth.jwt() ->> 'email'));
```
