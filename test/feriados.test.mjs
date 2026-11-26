import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK, feriadosHandler, holidaysFor, normalizeHolidays } from '../lib/feriados.mjs';
import { asHolidays, cleanCompanyDay, companyDaysAdmin } from '../lib/company-days.mjs';

test('Feriados: normaliza la fuente y usa el respaldo de 2026 si no responde', async () => {
  assert.equal(FALLBACK[2026].length, 20);
  assert.ok(FALLBACK[2026].some((item) => item.fecha === '2026-11-09'));
  assert.equal(normalizeHolidays([{ fecha: '2026-12-25', nombre: 'Navidad', tipo: 'inamovible' }, { fecha: 'x' }]).length, 1);
  const value = await holidaysFor(2031, async () => ({ ok: false, status: 500 }), 1);
  assert.equal(value.source, 'sin-datos');
  const fresh = await holidaysFor(2030, async () => ({ ok: true, json: async () => [{ fecha: '2030-01-01', nombre: 'Año nuevo', tipo: 'inamovible' }] }), 1);
  assert.equal(fresh.source, 'argentinadatos');
});

test('Feriados: la respuesta suma los días cerrados de la empresa', async () => {
  let sent = null;
  const response = { setHeader() {}, status() { return this; }, json(body) { sent = body; return this; } };
  await feriadosHandler({ query: { feriados: '2026' } }, response, async () => ({ ok: false }), async () => [{ fecha: '2026-12-02', nombre: 'Día del plástico', tipo: 'empresa' }]);
  assert.ok(sent.holidays.some((item) => item.tipo === 'empresa' && item.fecha === '2026-12-02'));
  assert.ok(sent.holidays.some((item) => item.fecha === '2026-12-25'));
});

test('Días cerrados: validación, forma de feriado y solo administradores escriben', async () => {
  assert.ok(cleanCompanyDay({ fecha: '2026-12-02', nombre: 'x' }).error);
  const half = cleanCompanyDay({ fecha: '2026-12-23', nombre: 'Fiesta de fin de año', tipo: 'medio-dia', desde: '12:30' }).day;
  assert.deepEqual(asHolidays([half], 2026), [{ fecha: '2026-12-23', nombre: 'Fiesta de fin de año', tipo: 'empresa-medio-dia', desde: '12:30' }]);
  const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const http = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' });
  const denied = await companyDaysAdmin({ body: { op: 'save', fecha: '2026-12-02', nombre: 'Día del plástico' } }, env, http, { authenticate: async () => ({ id: 'u', email: 'brenda@grupopoliplast.com.ar' }), isAdmin: () => false });
  assert.equal(denied.status, 403);
  const listed = await companyDaysAdmin({ body: { op: 'list' } }, env, http, { authenticate: async () => ({ id: 'u', email: 'brenda@grupopoliplast.com.ar' }), isAdmin: () => false });
  assert.equal(listed.status, 200);
});
