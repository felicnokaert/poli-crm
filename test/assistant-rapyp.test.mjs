import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rapypFor, rulesContext, isRule } from '../src/assistant-rapyp.mjs';

const buyer = (id, company, city, province, kg, last) => ({ id, company, city, province, cuit: `20${id.padStart(8, '0')}1`, polio8: { invoiced: true, lastDate: last, documents: 3, products: [{ name: 'POLIPLAST 618 SP', times: 3, qty: kg, last }] } });
const clients = [
  buyer('1', 'Aislaciones Norte', 'La Plata', 'Buenos Aires', 300, '2026-09-01'),
  buyer('2', 'Espumas del Sur', 'La Plata', 'Buenos Aires', 1200, '2026-10-01'),
  buyer('3', 'Integral Buenos Aires', 'La Plata', 'Buenos Aires', 5000, '2026-10-10'),
  buyer('4', 'Proyectados Córdoba', 'Córdoba', 'Córdoba', 900, '2026-08-01'),
  { id: '5', company: 'Pinturería X', city: 'La Plata', province: 'Buenos Aires', cuit: '20000000051' },
];
const competitors = [{ name: 'Integral Buenos Aires', kind: 'equipos' }];

test('recomienda aplicadores RAPYP de la zona, del mejor cliente al peor, sin competidores', () => {
  const found = rapypFor(clients, 'recomendame un aplicador en la plata', { competitors, today: '2026-10-22' });
  assert.equal(found.total, 2);
  assert.match(found.list[0], /^Espumas del Sur · La Plata, Buenos Aires.*1\.200 kg/);
  assert.match(found.list[1], /^Aislaciones Norte/);
  assert.ok(!found.list.join(' ').includes('Integral'));
  assert.equal(rapypFor(clients, 'cuanto rinde la epoxi', { competitors }), null);
});

test('las reglas y los competidores van siempre a la IA', () => {
  const rules = [{ product: 'regla', answer: 'Máquinas: coordinar con Juan y David; capacitación con Adrián.' }, { product: 'Easy Spray', answer: 'x' }].filter(isRule);
  const text = rulesContext({ rules, competitors });
  assert.match(text, /REGLAS DE LA EMPRESA[\s\S]*Adrián/);
  assert.match(text, /nunca ofrecerles nada.*Integral Buenos Aires/);
});
