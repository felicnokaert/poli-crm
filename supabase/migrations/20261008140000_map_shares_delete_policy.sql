-- Permite al equipo ELIMINAR links del mapa de la lista (Cartera > Mapa > Compartir).
-- Hasta ahora solo se podian "dejar de compartir" (revoked_at) y quedaban en la lista para siempre.
-- Eliminar una fila tambien corta el link al instante (api/mapa-publico.js no encuentra el hash y
-- responde 404, igual que con un link revocado). Los usuarios anonimos siguen sin ningun acceso.
drop policy if exists map_shares_delete on public.map_shares;
create policy map_shares_delete on public.map_shares
  for delete to authenticated
  using (public.is_poliplast_crm_user());
