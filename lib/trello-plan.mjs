// Plan del día en Trello (24/10, Felipe: "seguimos con el Plan del día"). Después del cron de alertas, arma una tarjeta
// "🎯 Plan del día <fecha>" en la lista "Prioridad semanal" con lo más importante que ya detectó el CRM (máx. 5, lo
// urgente primero). SOLO LEE las alertas del CRM y SOLO ESCRIBE en Trello: no toca Mercado Libre ni Shopify.
// Variables en Vercel: TRELLO_KEY y TRELLO_TOKEN (https://trello.com/app-key). Opcionales: TRELLO_BOARD_ID, TRELLO_LIST_ID.
import { db } from './mercadolibre.mjs';
import { refreshAlerts } from './crm-alerts.mjs';
import { recordCronRun } from './cron-status.mjs';
import { authenticatedCorporateUser } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';

const API = 'https://api.trello.com/1';
export const DEFAULT_BOARD = '6a96eca4f2ed06b8b8e56d2f'; // VENTAS — Grupo Poliplast
export const LIST_NAME = 'Prioridad semanal';
export const STATUS_KEY = 'trello-plan';
export const MAX_ITEMS = 5;

const plain = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SEVERITY = { alta: 0, media: 1 };
const MARK = { alta: '🔴', media: '🟡' };

export const trelloConfigured = (environment = process.env) => Boolean(environment.TRELLO_KEY && environment.TRELLO_TOKEN);
export const argentinaDate = (now = Date.now()) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);

// Ítems del día: solo urgentes e importantes; sin los pedidos de Shopify (los ve Brenda); lo más viejo primero dentro de cada gravedad.
export function planItems(alerts = [], now = Date.now(), limit = MAX_ITEMS) {
  const open = alerts.filter((alert) => !alert.resolved_at && SEVERITY[alert.severity] !== undefined)
    .map((alert) => ({ ...alert, days: Math.max(0, Math.floor((now - Date.parse(alert.first_seen || now)) / 86400000)) }));
  // 26/10 (Felipe): los pedidos de Shopify los atiende Brenda; no entran al plan aunque haya alertas viejas abiertas.
  const rest = open.filter((alert) => alert.type !== 'shopify-pedido');
  const sorted = rest.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || b.days - a.days || a.title.localeCompare(b.title, 'es'));
  return { items: sorted.slice(0, limit), extra: Math.max(0, sorted.length - limit) };
}

export function itemText(item) {
  return `${MARK[item.severity]} ${item.title}${item.days >= 1 ? ` (hace ${item.days} ${item.days === 1 ? 'día' : 'días'})` : ''}`.slice(0, 500);
}

export function cardContent(plan, date, appUrl = 'https://poli-crm.vercel.app') {
  const lines = plan.items.map((item) => `- ${itemText(item)}${item.detail ? `\n  ${item.detail}` : ''}`);
  const more = plan.extra ? `\n\nQuedan ${plan.extra} alerta${plan.extra === 1 ? '' : 's'} más en el CRM.` : '';
  return {
    name: `🎯 Plan del día ${date}`,
    desc: `Armado solo por el CRM con las alertas de hoy. Cada una dice hace cuántos días está abierta.\n\n${lines.join('\n')}${more}\n\nVer todo: ${appUrl} → Inicio → Qué atender hoy.`,
    due: `${date}T20:00:00.000Z`, // 17:00 en Argentina: aparece como "hoy" para el equipo
  };
}

async function trello(http, environment, method, path, body = {}) {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(environment.TRELLO_KEY)}&token=${encodeURIComponent(environment.TRELLO_TOKEN)}`;
  const response = await http(url, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    const text = String(await response.text?.().catch(() => '')).replace(/key=[^&\s]+|token=[^&\s]+/g, '[oculto]').slice(0, 160);
    throw new Error(`Trello ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json();
}

// La lista se busca por nombre en el tablero (los IDs pueden cambiar); si no aparece se usa TRELLO_LIST_ID.
export async function findList(http, environment) {
  const board = environment.TRELLO_BOARD_ID || DEFAULT_BOARD;
  try {
    const lists = await trello(http, environment, 'GET', `/boards/${board}/lists?fields=name`);
    const found = lists.find((list) => plain(list.name) === plain(LIST_NAME));
    if (found) return found.id;
  } catch (error) {
    if (!environment.TRELLO_LIST_ID) throw error;
  }
  if (environment.TRELLO_LIST_ID) return environment.TRELLO_LIST_ID;
  throw new Error(`No encontré la lista "${LIST_NAME}" en el tablero de Trello.`);
}

export async function createPlan(environment = process.env, http = fetch, store = db(environment, http), now = Date.now(), { force = false } = {}) {
  if (!trelloConfigured(environment)) return { ok: true, skipped: 'falta cargar TRELLO_KEY y TRELLO_TOKEN en Vercel' };
  const date = argentinaDate(now);
  if (!force) {
    const done = await store.select(`crm_system_status?key=eq.${STATUS_KEY}&select=detail`).catch(() => []);
    if (done?.[0]?.detail?.date === date) return { ok: true, skipped: `el plan de ${date} ya se creó` };
  }
  const alerts = await store.select('crm_alerts?select=*&resolved_at=is.null&limit=500');
  const plan = planItems(alerts, now);
  if (!plan.items.length) return { ok: true, skipped: 'no hay alertas urgentes ni importantes hoy' };
  const content = cardContent(plan, date);
  const listId = await findList(http, environment);
  const card = await trello(http, environment, 'POST', '/cards', { ...content, idList: listId, pos: 'top' });
  const checklist = await trello(http, environment, 'POST', '/checklists', { idCard: card.id, name: 'Acciones del día' });
  for (const item of plan.items) await trello(http, environment, 'POST', `/checklists/${checklist.id}/checkItems`, { name: itemText(item) });
  await recordCronRun(environment, { key: STATUS_KEY, ok: true, detail: { date, cardId: card.id, items: plan.items.length } }, new Date(now).toISOString(), http).catch(() => null);
  return { ok: true, date, items: plan.items.length, url: card.shortUrl || card.url || '' };
}

// Vercel puede correr un cron hasta una hora tarde: antes de armar el plan se refrescan las alertas, así nunca sale con las de ayer.
export async function trelloPlanCron(request, environment = process.env, http = fetch) {
  try {
    if (trelloConfigured(environment)) await refreshAlerts(environment, http).catch(() => null);
    return { status: 200, body: await createPlan(environment, http) };
  }
  catch (error) { return { status: 200, body: { ok: false, error: String(error?.message || error).slice(0, 300) } }; }
}

export async function trelloPlanAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede crear el plan del día.' } };
  if (request.body?.op === 'status') return { status: 200, body: { ok: true, configured: trelloConfigured(environment) } };
  if (!trelloConfigured(environment)) return { status: 400, body: { error: 'Falta cargar TRELLO_KEY y TRELLO_TOKEN en Vercel (se sacan en trello.com/app-key).' } };
  try {
    const result = await createPlan(environment, http, db(environment, http), Date.now(), { force: true });
    return { status: 200, body: result };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message || error).slice(0, 300) } };
  }
}
