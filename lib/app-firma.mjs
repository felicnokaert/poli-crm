// Poliplast App (26/11): Conteo, Dosificado y Cortes de Etiquetas SIN PIN dentro de la app. Felipe: «serán permisos
// de la app». El servidor del CRM firma (Ed25519) quién es, de qué depósito y si es administrador de Logística; la app
// de conteo verifica con la clave PÚBLICA (dosif_config.app_firma_publica) en su función «app-sesion». La privada vive
// solo en Vercel (APP_FIRMA_PRIVADA, base64 del PKCS8 DER) y nunca sale. La app de conteo suelta sigue con su PIN.
// Token: <payload_b64url>.<firma_b64url>; payload { v:1, persona, deposito, admin, exp (s, 5 min), aud:'conteo' }.
import { createHmac, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { db } from './mercadolibre.mjs';

export const TOKEN_TTL_S = 300;
export const DEPOSITOS = ['Villa Domínico', 'Mar del Plata'];
// Administradores de Logística de hoy en la app de conteo (Felipe, Diego, Juan, David). Además, cualquiera a quien
// Felipe le habilite «Conteo → Administración» en Equipo (module_access conteo.administracion = true).
export const LOGISTICS_ADMINS = ['felipe@grupopoliplast.com.ar', 'diegoraul@grupopoliplast.com.ar', 'juan@grupopoliplast.com.ar', 'david@grupopoliplast.com.ar'];
export const ADMIN_KEYS = ['conteo.administracion', 'etiquetas.cortes'];

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');

export function privateKeyFrom(environment = process.env) {
  const raw = environment.APP_FIRMA_PRIVADA;
  if (raw) return createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
  // Sin variable propia: la clave se DERIVA en el servidor de la clave de servicio de Supabase (que ya está en
  // Vercel), así nadie tiene que cargar ni copiar un secreto nuevo. Si esa clave cambia, cambia la pública
  // (se vuelve a leer en /api/admin-users?app-firma-publica=1).
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) return null;
  const seed = createHmac('sha256', environment.SUPABASE_SERVICE_ROLE_KEY).update('poliplast-app-firma-v1').digest();
  return createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
}

export function publicKeyB64url(privateKey) {
  const der = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return b64url(der.subarray(der.length - 32)); // los 32 bytes crudos de la clave Ed25519
}

export function signToken(payload, privateKey) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(sign(null, Buffer.from(body, 'ascii'), privateKey))}`;
}

export function buildPayload({ persona, deposito, admin }, now = Date.now()) {
  return { v: 1, persona: String(persona || '').trim().slice(0, 60), deposito, admin: Boolean(admin), exp: Math.floor(now / 1000) + TOKEN_TTL_S, aud: 'conteo' };
}

export function isLogisticsAdmin(email, grants = [], isAdmin = () => false) {
  const mail = String(email || '').toLowerCase();
  return isAdmin(mail) || LOGISTICS_ADMINS.includes(mail) || grants.some((row) => ADMIN_KEYS.includes(row.module) && row.allowed === true);
}

export async function appFirmaAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin = () => false } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const key = privateKeyFrom(environment);
  if (!key) return { status: 503, body: { error: 'El servidor no tiene con qué firmar.' } };
  if (request.body?.op === 'publica') return { status: 200, body: { ok: true, publica: publicKeyB64url(key) } };
  const deposito = DEPOSITOS.find((item) => item === request.body?.deposito);
  if (!deposito) return { status: 400, body: { error: 'Elegí el depósito.' } };
  const persona = String(request.body?.persona || caller.user_metadata?.full_name || caller.email.split('@')[0]).trim();
  let grants = [];
  try { grants = await db(environment, http).select(`module_access?select=module,allowed&email=eq.${encodeURIComponent(caller.email.toLowerCase())}`); } catch { grants = []; }
  const admin = isLogisticsAdmin(caller.email, Array.isArray(grants) ? grants : [], isAdmin);
  return { status: 200, body: { ok: true, firma: signToken(buildPayload({ persona, deposito, admin }), key), admin, exp: TOKEN_TTL_S } };
}

// Clave pública (no es secreta): la lee la app de conteo para guardarla en dosif_config.app_firma_publica.
export function publicKeyHandler(request, response) {
  const key = privateKeyFrom(process.env);
  response.setHeader('Cache-Control', 'no-store');
  if (!key) return response.status(503).json({ error: 'Sin clave.' });
  return response.status(200).json({ alg: 'Ed25519', publica: publicKeyB64url(key) });
}
