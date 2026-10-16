// Limpieza de espacios contaminados con datos de Felipe (ver src/workspace-cleanup.mjs). Solo la corre
// Felipe desde Más → Datos. Primero "preview" (no escribe nada) y después "apply" con su OK.
// Va por el servidor porque necesita leer el espacio de Felipe y escribir el de otras cuentas.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { automaticTaskCount, cleanCopiedWorkspace } from '../src/workspace-cleanup.mjs';
import { channelsForEmail } from '../src/user-channels.mjs';

// Cuentas de Felipe: su espacio es la referencia y nunca se limpia.
export const OWNER_EMAILS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com', 'marketing@grupopoliplast.com.ar'];

async function json(http, url, environment) {
  const response = await http(url, { headers: serviceHeaders(environment) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function listUsers(environment, http) {
  const users = [];
  for (let page = 1; page < 20; page += 1) {
    const body = await json(http, `${environment.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, environment);
    const batch = body.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

export async function planCleanup(environment, http) {
  const base = environment.SUPABASE_URL;
  const [users, rows, channels] = await Promise.all([
    listUsers(environment, http),
    json(http, `${base}/rest/v1/workspace_states?select=workspace_key,data,updated_at`, environment),
    json(http, `${base}/rest/v1/whatsapp_channels?select=channel_key,member_emails`, environment).catch(() => []),
  ]);
  const emailById = new Map(users.map((user) => [user.id, String(user.email || '').toLowerCase()]));
  const ownerStates = rows.filter((row) => OWNER_EMAILS.includes(emailById.get(row.workspace_key))).map((row) => row.data || {});
  if (!ownerStates.length) throw new Error('No encontré el espacio de Felipe para comparar.');
  const plans = [];
  for (const row of rows) {
    const email = emailById.get(row.workspace_key);
    // Solo cuentas reales que no son de Felipe (los espacios viejos sin usuario no se tocan).
    if (!email || OWNER_EMAILS.includes(email)) continue;
    const allowedChannels = [...new Set([
      ...channelsForEmail(email),
      ...(channels || []).filter((channel) => (channel.member_emails || []).includes(email)).map((channel) => channel.channel_key),
    ])];
    const result = cleanCopiedWorkspace(row.data || {}, ownerStates, { allowedChannels });
    plans.push({ workspaceKey: row.workspace_key, email, updatedAt: row.updated_at, ...result, automaticTasks: automaticTaskCount(result.state) });
  }
  return plans;
}

export async function cleanupWorkspaces(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede limpiar espacios.' } };
  const apply = request.body?.mode === 'apply';
  let plans;
  try {
    plans = await planCleanup(environment, http);
  } catch (error) {
    return { status: 502, body: { error: `No se pudo revisar los espacios (${error.message}).` } };
  }
  const summary = plans.map(({ email, removed, changed, automaticTasks }) => ({ email, removed, changed, automaticTasks }));
  if (!apply) return { status: 200, body: { ok: true, mode: 'preview', accounts: summary } };

  const applied = [];
  for (const plan of plans.filter((item) => item.changed)) {
    // Solo si nadie guardó esa cuenta desde la vista previa recién calculada (mismo updated_at).
    const response = await http(
      `${environment.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(plan.workspaceKey)}&updated_at=eq.${encodeURIComponent(plan.updatedAt)}`,
      {
        method: 'PATCH',
        headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ data: plan.state, updated_by_email: caller.email, updated_at: new Date().toISOString() }),
      },
    );
    const rows = response.ok ? await response.json().catch(() => []) : [];
    applied.push({ email: plan.email, ok: response.ok && rows.length > 0 });
  }
  return { status: 200, body: { ok: applied.every((item) => item.ok), mode: 'apply', accounts: summary, applied } };
}
