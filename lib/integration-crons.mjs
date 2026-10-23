import { recordCronRun } from './cron-status.mjs';
import { safeEqual } from './safe-equal.mjs';

// Actualizaciones automáticas de cada día (23/10, Felipe: "que todos los módulos se actualicen solos una vez por
// día, sin que yo toque el botón; si falla, es porque algo pasa"). Cada integración corre en su propio pedido
// (Vercel corta a los 60 s) y deja constancia en crm_system_status (key integration:<nombre>):
//  - al empezar se anota "corriendo"; si Vercel la corta a mitad, queda así y el CRM lo muestra como cortada;
//  - al terminar se anota si salió bien y los problemas que devolvió.
export const INTEGRATION_PREFIX = 'integration:';

// Junta los textos de error que devuelven los crons (campos error / errors en cualquier nivel).
export function cronProblems(body, max = 8) {
  const found = [];
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 4 || found.length >= max) return;
    if (Array.isArray(value)) { value.forEach((entry) => walk(entry, depth + 1)); return; }
    const label = value.nickname || value.company || value.name || '';
    if (typeof value.error === 'string' && value.error) found.push(label ? `${label}: ${value.error}` : value.error);
    if (Array.isArray(value.errors)) value.errors.filter((entry) => typeof entry === 'string' && entry).forEach((entry) => found.push(label ? `${label}: ${entry}` : entry));
    for (const [key, child] of Object.entries(value)) if (key !== 'errors' && child && typeof child === 'object') walk(child, depth + 1);
  };
  walk(body, 0);
  return [...new Set(found.map((text) => String(text).slice(0, 200)))].slice(0, max);
}

export async function runIntegrationCron(name, job, request, environment = process.env, fetchImpl = fetch) {
  const secret = environment.CRON_SECRET;
  if (!secret || !safeEqual(request.headers?.authorization || '', `Bearer ${secret}`)) return { status: 401, body: { error: 'No autorizado.' } };
  const key = `${INTEGRATION_PREFIX}${name}`;
  const started = new Date().toISOString();
  const note = (entry) => recordCronRun(environment, { key, ...entry }, new Date().toISOString(), fetchImpl).catch(() => null);
  await note({ ok: false, detail: { running: true, started } });
  let result;
  try {
    result = await job(request, environment);
  } catch (error) {
    result = { status: 500, body: { ok: false, error: String(error?.message || error).slice(0, 300) } };
  }
  const body = result?.body || {};
  const ok = result?.status === 200 && body.ok !== false;
  await note({ ok, detail: { started, finished: new Date().toISOString(), seconds: Math.round((Date.now() - Date.parse(started)) / 1000), skipped: body.skipped || null, problems: cronProblems(body) } });
  return result;
}
