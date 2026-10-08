import { createHash } from 'node:crypto';

// El link compartido tiene 32 bytes al azar en base64url (43 caracteres). Cualquier otra
// forma se rechaza antes de tocar la base.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidShareToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

// Misma funcion que usa el navegador (src/map-share.mjs, hashTokenHex): SHA-256 en hexa.
export function hashShareToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Devuelve la foto publicada ({clientes, fecha_export, publico}) o null si el link no existe,
// esta revocado o es invalido. Nunca distingue entre esos casos hacia afuera.
export async function fetchSnapshotByToken(environment, token, fetchImpl = fetch) {
  if (!isValidShareToken(token)) return null;
  const hash = hashShareToken(token);
  const response = await fetchImpl(
    `${environment.SUPABASE_URL}/rest/v1/map_shares?token_hash=eq.${hash}&revoked_at=is.null&select=snapshot&limit=1`,
    { headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!response.ok) throw new Error(`map_shares respondio ${response.status}`);
  const rows = await response.json();
  return rows[0]?.snapshot || null;
}
