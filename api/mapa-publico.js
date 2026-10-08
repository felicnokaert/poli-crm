import { withRetry } from '../lib/retry.mjs';
import { logError } from '../lib/log.mjs';
import { fetchSnapshotByToken, isValidShareToken } from '../lib/map-share.mjs';

// Lectura PUBLICA (sin login) del mapa compartido: /mapa?t=TOKEN -> /api/mapa-publico?t=TOKEN.
// Devuelve solo la foto que alguien del equipo publico a proposito (sin CUIT, telefonos ni
// emails; ver src/map-share.mjs). Un link invalido, inexistente o revocado responde igual
// (404) para no dar pistas. La base se lee con la service role key: la tabla map_shares no
// tiene ninguna policy para usuarios anonimos.
export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido, usar GET.' });
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Cache-Control', 'no-store, max-age=0'); // revocar tiene que valer al instante

  const token = request.query?.t;
  if (!isValidShareToken(token)) return response.status(404).json({ error: 'Mapa no disponible.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return response.status(500).json({ error: 'Servicio no configurado.' });
  }

  try {
    const result = await withRetry(async () => {
      try {
        return { ok: true, snapshot: await fetchSnapshotByToken(process.env, token) };
      } catch (error) {
        return { ok: false, threw: true, error };
      }
    });
    if (!result.ok) throw result.error || new Error('map_shares no respondio ok.');
    if (!result.snapshot) return response.status(404).json({ error: 'Mapa no disponible.' });
    return response.status(200).json(result.snapshot);
  } catch (error) {
    logError('mapa-publico', 'failed to read shared map', {}, error);
    return response.status(500).json({ error: 'Error interno.' });
  }
}
