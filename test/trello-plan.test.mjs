import test from 'node:test';
import assert from 'node:assert/strict';
import { planItems, cardContent, itemText, createPlan, argentinaDate, trelloConfigured } from '../lib/trello-plan.mjs';

const now = Date.parse('2026-10-24T15:00:00Z');
const day = (n) => new Date(now - n * 86400000).toISOString();
const alert = (over) => ({ type: 't', entity_id: '', severity: 'media', title: 'X', detail: '', first_seen: day(0), resolved_at: null, ...over });

test('plan: lo urgente primero, máximo 5, pedidos de Shopify juntos y sin las "para mejorar"', () => {
  const alerts = [
    alert({ type: 'a', severity: 'baja', title: 'Baja' }),
    alert({ type: 'b', severity: 'media', title: 'Media vieja', first_seen: day(5) }),
    alert({ type: 'c', severity: 'alta', title: 'Alta nueva' }),
    alert({ type: 'd', severity: 'alta', title: 'Alta vieja', first_seen: day(3) }),
    alert({ type: 'shopify-pedido', entity_id: 'o1', severity: 'media', title: 'Pedido #1174: retiro sin retirar hace 10 días', first_seen: day(9) }),
    alert({ type: 'shopify-pedido', entity_id: 'o2', severity: 'alta', title: 'Pedido #1192: sin despachar hace 3 días', first_seen: day(2) }),
    alert({ type: 'e', severity: 'media', title: 'M1' }), alert({ type: 'f', severity: 'media', title: 'M2' }),
    alert({ type: 'g', severity: 'alta', title: 'Resuelta', resolved_at: day(1) }),
  ];
  const plan = planItems(alerts, now);
  assert.equal(plan.items.length, 5);
  assert.deepEqual(plan.items.slice(0, 3).map((item) => item.severity), ['alta', 'alta', 'alta']);
  assert.match(plan.items[0].title, /^2 pedidos de Shopify/); // alta y la más vieja (9 días)
  assert.equal(plan.items[1].title, 'Alta vieja');
  assert.match(plan.items.find((item) => /pedidos de Shopify/.test(item.title)).title, /^2 pedidos de Shopify sin entregar/);
  assert.ok(!plan.items.some((item) => item.title === 'Baja' || item.title === 'Resuelta'));
  assert.equal(plan.extra, 1);
  assert.match(itemText(plan.items[1]), /^🔴 Alta vieja \(hace 3 días\)$/);
});

test('tarjeta: nombre con la fecha y vencimiento a las 20:00 UTC (17:00 en Argentina)', () => {
  assert.equal(argentinaDate(Date.parse('2026-10-25T01:00:00Z')), '2026-10-24');
  const content = cardContent({ items: [{ severity: 'alta', title: 'Algo', days: 0, detail: 'Detalle' }], extra: 2 }, '2026-10-24');
  assert.equal(content.name, '🎯 Plan del día 2026-10-24');
  assert.equal(content.due, '2026-10-24T20:00:00.000Z');
  assert.match(content.desc, /Quedan 2 alertas más/);
});

function fakeTrello({ lists = [{ id: 'L1', name: 'Prioridad semanal' }], done = [] } = {}) {
  const calls = [];
  const http = async (url, init = {}) => {
    const u = new URL(url);
    calls.push([init.method || 'GET', u.pathname, init.body ? JSON.parse(init.body) : null, u.searchParams.get('token')]);
    const json = u.pathname.endsWith('/lists') ? lists : u.pathname === '/1/cards' ? { id: 'card1', shortUrl: 'https://trello.com/c/x' } : u.pathname === '/1/checklists' ? { id: 'chk1' } : {};
    return { ok: true, status: 200, json: async () => json, text: async () => '' };
  };
  const store = { select: async (path) => (path.startsWith('crm_system_status') ? done : [alert({ type: 'c', severity: 'alta', title: 'Alta nueva' }), alert({ type: 'b', severity: 'media', title: 'Media' })]) };
  return { http, store, calls };
}
const env = { TRELLO_KEY: 'k', TRELLO_TOKEN: 'secreto', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };

test('crea la tarjeta en la lista que se llama "Prioridad semanal" (por nombre) con su checklist', async () => {
  const { http, store, calls } = fakeTrello({ lists: [{ id: 'otra', name: 'Entrada' }, { id: 'L9', name: 'Prioridad semanal' }] });
  const result = await createPlan(env, http, store, now);
  assert.equal(result.items, 2);
  const card = calls.find(([method, path]) => method === 'POST' && path === '/1/cards');
  assert.equal(card[2].idList, 'L9');
  assert.equal(card[2].pos, 'top');
  assert.equal(card[2].due, '2026-10-24T20:00:00.000Z');
  assert.equal(calls.filter(([, path]) => path.endsWith('/checkItems')).length, 2);
  assert.ok(calls.filter(([, path]) => path.startsWith('/1/')).every(([, , , token]) => token === 'secreto'));
});

test('no hace nada si falta la llave, si ya se creó hoy o si no hay alertas', async () => {
  assert.equal(trelloConfigured({}), false);
  assert.match((await createPlan({}, null, null, now)).skipped, /TRELLO_KEY/);
  const same = fakeTrello({ done: [{ detail: { date: '2026-10-24' } }] });
  assert.match((await createPlan(env, same.http, same.store, now)).skipped, /ya se creó/);
  assert.equal(same.calls.length, 0);
  const none = fakeTrello();
  none.store.select = async (path) => (path.startsWith('crm_system_status') ? [] : []);
  assert.match((await createPlan(env, none.http, none.store, now)).skipped, /no hay alertas/);
});

test('si Trello falla, el error no deja ver la llave ni el token', async () => {
  const http = async () => ({ ok: false, status: 401, text: async () => 'invalid token=secreto&key=k' });
  const store = { select: async () => [alert({ severity: 'alta' })] };
  await assert.rejects(() => createPlan(env, http, store, now), (error) => !/secreto/.test(error.message) && /401/.test(error.message));
});
