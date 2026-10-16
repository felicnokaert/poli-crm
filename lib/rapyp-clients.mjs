// Mapa de aplicadores (RAPYP) para Juan y David con los datos de Felipe, que son los completos
// (empresas, ubicaciones, compras de POLIOCHO y tipo de cliente). Lo lee el servidor con la clave
// de servicio y solo lo entrega a quien puede ver RAPYP; no pasa por el directorio del equipo, así
// el resto no ve compras. Devuelve solo los campos que usa el mapa (src/map-clients-adapter.mjs),
// así el navegador aplica la misma lógica que en la cuenta de Felipe.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { listUsers, OWNER_EMAILS } from './workspace-cleanup-admin.mjs';
import { canSeeRapypMap } from '../src/personal-tools.mjs';

const MAP_FIELDS = ['id', 'company', 'legalName', 'cuit', 'family', 'city', 'province', 'address', 'postalCode', 'phone', 'email',
  'contacts', 'lastPurchase', 'totalPurchases', 'purchaseWithoutInvoice', 'tipoCliente', 'tipoClienteNota', 'esAplicador', 'polio8', 'updatedAt'];

export function pickMapFields(client = {}) {
  const out = {};
  for (const key of MAP_FIELDS) if (client[key] !== undefined && client[key] !== null && client[key] !== '') out[key] = client[key];
  if (Array.isArray(out.contacts)) out.contacts = out.contacts.map(({ name, phone, whatsappId, email, primary }) => ({ name, phone, whatsappId, email, primary }));
  return out;
}

// Une las empresas de las cuentas de Felipe: por id, gana la versión más reciente; sin las borradas.
export function mergeOwnerClients(states = []) {
  const deleted = new Set(states.flatMap((state) => state?.deletedRecordIds?.clients || []));
  const byId = new Map();
  for (const state of states) {
    for (const client of state?.clients || []) {
      if (!client?.id || deleted.has(client.id)) continue;
      const current = byId.get(client.id);
      if (!current || String(client.updatedAt || '') >= String(current.updatedAt || '')) byId.set(client.id, client);
    }
  }
  return [...byId.values()].map(pickMapFields);
}

export async function rapypClients(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!canSeeRapypMap(caller.email)) return { status: 403, body: { error: 'El mapa de aplicadores es solo para Felipe, Juan y David.' } };
  const users = await listUsers(environment, http);
  const ownerIds = users.filter((user) => OWNER_EMAILS.includes(String(user.email || '').toLowerCase())).map((user) => user.id);
  if (!ownerIds.length) return { status: 200, body: { clients: [] } };
  const response = await http(`${environment.SUPABASE_URL}/rest/v1/workspace_states?select=data&workspace_key=in.(${ownerIds.join(',')})`, { headers: serviceHeaders(environment) });
  if (!response.ok) return { status: 502, body: { error: 'No se pudieron leer las empresas.' } };
  const rows = await response.json();
  return { status: 200, body: { clients: mergeOwnerClients(rows.map((row) => row.data || {})) } };
}
