import test from 'node:test';
import assert from 'node:assert/strict';
import { SURPRISE_SIZE, surpriseMessage, surpriseMoment, surpriseQueue, logClientContact } from '../src/daily-queues.mjs';

const TODAY = '2026-11-10';
const info = (extra) => ({ purchaseCount: 3, firstPurchase: '2025-01-15', previousPurchase: '2026-09-01', lastPurchase: '2026-10-01', daysSince: 40, big: false, total24: 1000, ...extra });

test('compra grande reciente, primera compra, vuelta y aniversario se reconocen', () => {
  assert.equal(surpriseMoment(info({ big: true, daysSince: 5, lastPurchase: '2026-11-05' }), TODAY).kind, 'grande');
  assert.equal(surpriseMoment(info({ purchaseCount: 1, firstPurchase: '2026-11-01', previousPurchase: '', lastPurchase: '2026-11-01', daysSince: 9 }), TODAY).kind, 'primera');
  assert.equal(surpriseMoment(info({ previousPurchase: '2025-12-01', lastPurchase: '2026-11-05', daysSince: 5 }), TODAY).kind, 'volvio');
  const aniv = surpriseMoment(info({ firstPurchase: '2024-11-09', daysSince: 40 }), TODAY);
  assert.deepEqual([aniv.kind, aniv.years], ['aniversario', 2]);
});

test('sin un momento claro no hay sorpresa', () => {
  assert.equal(surpriseMoment(info({}), TODAY), null);
  assert.equal(surpriseMoment({ lastPurchase: '', daysSince: null }, TODAY), null);
  assert.equal(surpriseMoment(info({ purchaseCount: 1, firstPurchase: '2026-11-09', daysSince: 1, lastPurchase: '2026-11-09', previousPurchase: '' }), TODAY), null);
});

test('la lista es de a 5, primero lo más importante, y lo trabajado no vuelve por 60 días', () => {
  const clients = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, company: `Cliente ${i}`, contact: 'Ana Pérez' }));
  const base = new Map(clients.map((client, i) => [client.id, info(i < 6 ? { purchaseCount: 1, firstPurchase: '2026-11-01', previousPurchase: '', lastPurchase: '2026-11-01', daysSince: 9, total24: i } : { big: true, daysSince: 3, lastPurchase: '2026-11-07' })]));
  const list = surpriseQueue({ clients, base, today: TODAY });
  assert.equal(list.length, SURPRISE_SIZE);
  assert.equal(list[0].moment.kind, 'grande');
  const worked = clients.map((client) => (client.id === list[0].client.id ? logClientContact(client, { queue: 'sorpresa', outcome: 'Contactado', now: '2026-11-08T15:00:00Z' }) : client));
  assert.ok(!surpriseQueue({ clients: worked, base, today: TODAY }).some((item) => item.client.id === list[0].client.id));
});

test('los mensajes agradecen y nunca ofrecen precio, descuento ni promesas', () => {
  const client = { id: 'a', company: 'Obras SA', contact: 'Marta López' };
  for (const moment of [{ kind: 'grande' }, { kind: 'aniversario', years: 1 }, { kind: 'aniversario', years: 3 }, { kind: 'primera' }, { kind: 'volvio', months: 8 }]) {
    const text = surpriseMessage({ client, info: { firstPurchase: '2025-11-09' }, moment }, 'Felipe');
    assert.match(text, /Hola Marta/);
    assert.match(text, /Felipe/);
    assert.ok(!/\$|descuento|promo|precio|gratis|regalo/i.test(text), text);
  }
});
