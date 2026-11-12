import test from 'node:test';
import assert from 'node:assert/strict';
import { callPlan, noteCall, zoneOf, cityLabel } from '../src/prospect-calls.mjs';
import { blankProspect } from '../src/prospect-model.mjs';

const make = (fields) => blankProspect({ id: fields.company, phone: '+54 11 4000-1000', family: 'Penosil', rubro: 'Corralón', province: 'CABA', city: 'CABA (Mataderos)', ...fields });

test('zonas: CABA y GBA juntos, el resto por provincia', () => {
  assert.equal(zoneOf({ province: 'CABA', city: 'CABA (Almagro)' }), 'amba');
  assert.equal(zoneOf({ province: 'Buenos Aires', city: 'Pilar' }), 'amba');
  assert.equal(zoneOf({ province: 'Buenos Aires', city: 'Tandil' }), 'bsas');
  assert.equal(zoneOf({ province: 'Santa Fe', city: 'Avellaneda (Santa Fe)' }), 'santafe');
  assert.equal(zoneOf({ province: 'Entre Ríos', city: 'Paraná' }), 'entrerios');
  assert.equal(zoneOf({ province: 'Tucumán', city: 'San Miguel de Tucumán' }), 'noroeste');
  assert.equal(zoneOf({ province: 'Chubut', city: 'Trelew' }), 'patagonia');
  assert.equal(zoneOf({ province: 'Mendoza', city: 'Maipú' }), 'cuyo');
  assert.equal(cityLabel({ city: 'CABA (Villa Lugano)' }), 'CABA');
  assert.equal(cityLabel({ city: 'Paso del Rey (Moreno)' }), 'Paso del Rey');
});

test('el orden: zona fija, ciudad con más prospectos primero y Penosil antes que Planchas', () => {
  const list = [
    make({ company: 'P1', province: 'Santa Fe', city: 'Rosario' }),
    make({ company: 'P2', province: 'Santa Fe', city: 'Rosario', family: 'Planchas', rubro: 'Cámaras frigoríficas (fabricante)' }),
    make({ company: 'P3', province: 'Santa Fe', city: 'Rafaela' }),
    make({ company: 'C1' }),
    make({ company: 'C2', city: 'CABA (Almagro)' }),
  ];
  const plan = callPlan(list, { today: '2026-11-12' });
  assert.deepEqual(plan.zones.map((zone) => zone.id), ['amba', 'santafe']);
  assert.deepEqual(plan.zones[1].cities.map((city) => city.city), ['Rosario', 'Rafaela']);
  assert.deepEqual(plan.zones[1].cities[0].items.map((item) => item.prospect.company), ['P1', 'P2']);
  assert.equal(plan.zones[0].cities.length, 1);
  assert.equal(plan.total, 5);
});

test('quedan afuera: sin teléfono, ya contactados, no prioridad, bloqueados y los que no atendieron hoy', () => {
  const list = [
    make({ company: 'ok' }),
    make({ company: 'sin tel', phone: '' }),
    make({ company: 'contactado', state: 'Contactado' }),
    make({ company: 'cliente', linkedClientId: 'x', state: 'Contactado' }),
    make({ company: 'agro', rubro: 'Distribuidor agropecuario' }),
    make({ company: 'bloq' }),
    make({ company: 'no atendio', lastCall: { date: '2026-11-12', result: 'no-atendio' } }),
    make({ company: 'ayer', lastCall: { date: '2026-11-11', result: 'no-atendio' } }),
  ];
  const plan = callPlan(list, { today: '2026-11-12', blocked: (item) => item.company === 'bloq' });
  const names = plan.zones.flatMap((zone) => zone.cities.flatMap((city) => city.items.map((item) => item.prospect.company))).sort();
  assert.deepEqual(names, ['ayer', 'ok']);
});

test('noteCall: no atendió suma intentos e historial; mail válido se guarda; mail roto no', () => {
  const state = { prospects: [make({ id: 'a', company: 'A' })] };
  const once = noteCall(state, 'a', 'no-atendio', { user: 'f@x.com', today: '2026-11-12', now: 'T1', email: 'ventas@corralon.com.ar' });
  assert.equal(once.prospects[0].callAttempts, 1);
  assert.equal(once.prospects[0].lastCall.result, 'no-atendio');
  assert.equal(once.prospects[0].email, 'ventas@corralon.com.ar');
  assert.equal(once.prospects[0].history.at(-1).outcome, 'No atendió (llamada)');
  const twice = noteCall(once, 'a', 'no-atendio', { today: '2026-11-13', now: 'T2', email: 'no es mail' });
  assert.equal(twice.prospects[0].callAttempts, 2);
  assert.equal(twice.prospects[0].email, 'ventas@corralon.com.ar');
  const onlyMail = noteCall(state, 'a', 'mail', { email: 'a@b.com' });
  assert.equal(onlyMail.prospects[0].email, 'a@b.com');
  assert.equal(onlyMail.prospects[0].lastCall, undefined);
});
