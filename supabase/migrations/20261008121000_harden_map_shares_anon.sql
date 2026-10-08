-- Defensa en profundidad para map_shares (ver 20261008120000_add_map_shares.sql): RLS ya deja
-- afuera a los usuarios anonimos (no tienen ninguna policy), y ademas se les quita el permiso
-- de tabla que Supabase otorga por defecto. La lectura publica del mapa compartido pasa
-- siempre por api/mapa-publico.js con la service role key, nunca directo desde el navegador.
revoke all on public.map_shares from anon;
