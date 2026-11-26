// Poliplast App (26/11, Felipe: «se suele cerrar por el día del plástico, fiesta de fin de año, medio día por x motivo o
// día completo: que un administrador lo cargue y todos lo vean»). Días cerrados de la EMPRESA, además de los feriados
// nacionales. Sin tablas nuevas: crm_system_status key company-days (lo lee el equipo, escribe solo el servidor).
// También salen en /api/feriados/AAAA (tipo «empresa»), así Entregas y la app de conteo los pueden leer igual.
import { db } from './mercadolibre.mjs';

export const COMPANY_DAYS_KEY = 'company-days';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const clip = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanCompanyDay(input = {}, caller = {}, now = new Date()) {
  const fecha = String(input.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elegí la fecha.' };
  const nombre = clip(input.nombre, 80);
  if (nombre.length < 3) return { error: 'Poné el motivo (ej. «Día del plástico»).' };
  const medio = input.tipo === 'medio-dia';
  const desde = medio && HORA.test(String(input.desde || '')) ? input.desde : medio ? '13:00' : null;
  return { day: { fecha, nombre, tipo: medio ? 'medio-dia' : 'cerrado', ...(medio ? { desde } : {}), nota: clip(input.nota, 200), by: String(caller.email || '').toLowerCase(), at: now.toISOString() } };
}

export async function readCompanyDays(store) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${COMPANY_DAYS_KEY}`).catch(() => []);
  return Array.isArray(rows?.[0]?.detail?.items) ? rows[0].detail.items : [];
}

async function writeCompanyDays(store, items) {
  const sorted = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-400);
  await store.upsert('crm_system_status', [{ key: COMPANY_DAYS_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { items: sorted } }]);
  return sorted;
}

// Para /api/feriados: los días de la empresa de ese año con la misma forma que los feriados.
export function asHolidays(items = [], year) {
  return items.filter((item) => String(item.fecha).startsWith(`${year}-`))
    .map((item) => ({ fecha: item.fecha, nombre: item.nombre, tipo: item.tipo === 'medio-dia' ? 'empresa-medio-dia' : 'empresa', ...(item.desde ? { desde: item.desde } : {}) }));
}

export async function companyDaysAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const store = db(environment, http);
  const op = request.body?.op || 'list';
  if (op === 'list') return { status: 200, body: { ok: true, items: await readCompanyDays(store) } };
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo un administrador carga los días cerrados.' } };
  if (op === 'save') {
    const { day, error } = cleanCompanyDay(request.body, caller);
    if (error) return { status: 400, body: { error } };
    const items = (await readCompanyDays(store)).filter((item) => item.fecha !== day.fecha);
    return { status: 200, body: { ok: true, items: await writeCompanyDays(store, [...items, day]) } };
  }
  if (op === 'remove') {
    const fecha = String(request.body?.fecha || '');
    const items = (await readCompanyDays(store)).filter((item) => item.fecha !== fecha);
    return { status: 200, body: { ok: true, items: await writeCompanyDays(store, items) } };
  }
  return { status: 400, body: { error: 'Operación desconocida.' } };
}
