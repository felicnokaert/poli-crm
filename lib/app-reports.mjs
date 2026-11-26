// Poliplast App (26/11): «Algo no anda». Cualquiera del equipo manda un aviso (qué pasó, en qué pantalla, qué tan
// grave) y los administradores los ven en Configuración → Avisos del equipo y los marcan resueltos.
// Sin tablas nuevas: se guarda en crm_system_status (key app-reports), lo escribe solo el servidor.
import { db } from './mercadolibre.mjs';

export const REPORTS_KEY = 'app-reports';
export const MAX_REPORTS = 300;
const SEVERITIES = ['no-me-deja', 'molesta', 'idea'];
const clip = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanReport(body = {}, caller = {}, now = new Date()) {
  const text = clip(body.text, 1500);
  if (text.length < 3) return { error: 'Contanos qué pasó (aunque sea una línea).' };
  return {
    report: {
      id: `r-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now.toISOString(),
      by: String(caller.email || '').toLowerCase(),
      name: clip(body.name, 80),
      text,
      severity: SEVERITIES.includes(body.severity) ? body.severity : 'molesta',
      view: clip(body.view, 40),
      viewLabel: clip(body.viewLabel, 60),
      width: Number(body.width) || null,
      agent: clip(body.agent, 160),
      version: clip(body.version, 40),
      status: 'nuevo',
    },
  };
}

async function readReports(store) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${REPORTS_KEY}`).catch(() => []);
  return Array.isArray(rows?.[0]?.detail?.items) ? rows[0].detail.items : [];
}
async function writeReports(store, items) {
  await store.upsert('crm_system_status', [{ key: REPORTS_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { items: items.slice(0, MAX_REPORTS) } }]);
}

export async function appReportsAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const store = db(environment, http);
  const op = request.body?.op || 'send';
  if (op === 'send') {
    const { report, error } = cleanReport(request.body, caller);
    if (error) return { status: 400, body: { error } };
    const items = await readReports(store);
    await writeReports(store, [report, ...items]);
    return { status: 200, body: { ok: true, id: report.id } };
  }
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo un administrador ve los avisos del equipo.' } };
  if (op === 'list') return { status: 200, body: { ok: true, items: await readReports(store) } };
  if (op === 'resolve') {
    const items = await readReports(store);
    const id = String(request.body?.id || '');
    const status = request.body?.status === 'nuevo' ? 'nuevo' : 'resuelto';
    const next = items.map((item) => (item.id === id ? { ...item, status, resolvedBy: caller.email, resolvedAt: new Date().toISOString() } : item));
    await writeReports(store, next);
    return { status: 200, body: { ok: true } };
  }
  return { status: 400, body: { error: 'Operación desconocida.' } };
}
