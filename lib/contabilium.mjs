// Contabilium (21/10): por ahora solo PRUEBA la conexión de las 3 empresas, leyendo cuántos clientes y
// productos tiene cada una. Nunca crea, cambia ni borra nada en Contabilium. Las claves viven en Vercel
// (CONTABILIUM_<EMPRESA>_CLIENT_ID / _CLIENT_SECRET) y nunca salen del servidor. Solo Felipe.
import { authenticatedCorporateUser } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';

const API = 'https://rest.contabilium.com';
export const CONTABILIUM_COMPANIES = [
  { key: 'POLIPLAST', name: 'Poliuretano y Plástico Proyectado (POLIPLAST)' },
  { key: 'COMARG', name: 'Foam Factory Latam (COMARG)' },
  { key: 'FOAMFACTORY', name: 'David Alejandro Benosilio (FOAM FACTORY)' },
];

async function errorText(response) {
  const body = await response.json().catch(() => null);
  return body?.error_description || body?.Message || body?.message || body?.error || `HTTP ${response.status}`;
}

export function companyCredentials(environment, key) {
  const id = environment[`CONTABILIUM_${key}_CLIENT_ID`];
  const secret = environment[`CONTABILIUM_${key}_CLIENT_SECRET`];
  return id && secret ? { id, secret } : null;
}

async function token(credentials, http) {
  const response = await http(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: credentials.id, client_secret: credentials.secret }).toString(),
  });
  if (!response.ok) throw new Error(`no aceptó las claves (${await errorText(response)})`);
  const body = await response.json();
  if (!body?.access_token) throw new Error('no devolvió un token');
  return body.access_token;
}

async function countOf(path, accessToken, http) {
  const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!response.ok) return { error: `${path.split('?')[0]}: ${await errorText(response)}` };
  const body = await response.json().catch(() => null);
  const total = Number(body?.TotalItems ?? body?.totalItems);
  return { total: Number.isFinite(total) ? total : (Array.isArray(body?.Items) ? body.Items.length : null) };
}

export async function testContabilium(environment, http) {
  const results = [];
  for (const company of CONTABILIUM_COMPANIES) {
    const credentials = companyCredentials(environment, company.key);
    if (!credentials) { results.push({ ...company, ok: false, error: 'faltan las claves en Vercel' }); continue; }
    try {
      const accessToken = await token(credentials, http);
      const clientes = await countOf('/api/clientes/search?filtro=&page=1&pageSize=1', accessToken, http);
      const productos = await countOf('/api/conceptos/search?filtro=&page=1&pageSize=1', accessToken, http);
      const error = [clientes.error, productos.error].filter(Boolean).join(' · ');
      results.push({ ...company, ok: !error, clientes: clientes.total ?? null, productos: productos.total ?? null, ...(error ? { error } : {}) });
    } catch (error) {
      results.push({ ...company, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  return results;
}

export async function contabiliumAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede probar Contabilium.' } };
  if (request.body?.op !== 'test') return { status: 400, body: { error: 'Acción inválida.' } };
  return { status: 200, body: { ok: true, companies: await testContabilium(environment, http) } };
}
