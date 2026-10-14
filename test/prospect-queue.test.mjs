import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, missingContact, prospectScore } from '../src/prospect-queue.mjs';

const base = { state: 'No contactado', createdAt: '2026-10-01T00:00:00Z' };

test('más datos de contacto verificables suben en la cola; competidores y duplicados confirmados no entran', () => {
  const prospects = [
    { id: 'a', ...base, company: 'Solo nombre' },
    { id: 'b', ...base, company: 'Completo', phone: '+54 9 11 5555 1234', website: 'b.com', email: 'x@b.com', notes: 'Evidencia: Fischer' },
    { id: 'c', ...base, company: 'Competidor', phone: '1', competitor: true },
    { id: 'd', ...base, company: 'Ya cliente', phone: '1' },
    { id: 'e', ...base, company: 'Ya contactado', state: 'Contactado', phone: '1' },
    { id: 'f', ...base, company: 'Con teléfono', phone: '3515550000' },
  ];
  const checks = new Map([['d', { status: 'Ya en el CRM' }]]);
  assert.deepEqual(buildQueue(prospects, checks), ['b', 'f', 'a']);
  assert.deepEqual(buildQueue(prospects, checks, { skipped: ['b'] }), ['f', 'a']);
});

test('un posible duplicado baja pero sigue en la cola, y empata por antigüedad', () => {
  assert.ok(prospectScore({ phone: '1' }, { status: 'Posible duplicado' }) < prospectScore({ phone: '1' }, { status: 'Nuevo' }));
  const queue = buildQueue([{ id: 'n', ...base, createdAt: '2026-10-05T00:00:00Z' }, { id: 'o', ...base, createdAt: '2026-10-02T00:00:00Z' }]);
  assert.deepEqual(queue, ['o', 'n']);
});

test('indica qué falta para contactarlo', () => {
  assert.deepEqual(missingContact({}), ['ningún dato de contacto', 'sitio web']);
  assert.deepEqual(missingContact({ phone: '1', website: 'x.com' }), ['mail']);
});
