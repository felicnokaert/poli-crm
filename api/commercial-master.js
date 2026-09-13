import { COMMERCIAL_MASTER_CLIENTS } from '../lib/commercial-master-data.mjs';
import { channelsForEmail } from '../src/user-channels.mjs';
import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';

// La cartera maestra es la cartera comercial de General (Poliuretano,
// PURMAC, Carrozados, Resinplast, etc.) - no tiene relación con Penosil ni
// con el número de Juan. Sin este chequeo, cualquier usuario autenticado de
// la empresa podía mezclarla en su propio workspace con un solo click.
export function canAccessCommercialMaster(email = '') {
  return channelsForEmail(email).includes('general');
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!canAccessCommercialMaster(user.email)) return response.status(403).json({ error: 'La cartera maestra pertenece a General y no está disponible para este canal.' });
  response.setHeader('Cache-Control', 'private, no-store');
  return response.status(200).json({ version: '2026-09-01-v2', clients: COMMERCIAL_MASTER_CLIENTS });
}
