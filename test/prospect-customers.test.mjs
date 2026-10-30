import test from 'node:test';
import assert from 'node:assert/strict';
import { customerKeys, isBillingCustomer } from '../src/prospect-customers.mjs';
import { buildQueue, prospectScore } from '../src/prospect-queue.mjs';
import { reviewPoints, reviewLabel } from '../src/prospect-signals.mjs';
import { normalizeGoogle } from '../lib/prospect-google.mjs';
import { DEFAULT_RULES, normalizeRules } from '../src/prospect-rules.mjs';

const keys = customerKeys([{ razon_social: 'Aislaciones del Sur S.R.L.', cuit: '30-71234567-8', telefono: '+54 9 11 5555-1234' }]);
const base = { id: 'p', state: 'No contactado', phone: '', company: 'X', createdAt: '2026-10-01' };

test('un prospecto que ya es cliente de Contabilium se empareja por nombre o por teléfono', () => {
  assert.equal(isBillingCustomer({ company: 'SUR AISLACIONES DEL' }, keys), true); // mismas palabras, otro orden
  assert.equal(isBillingCustomer({ company: 'Otra', phone: '011 5555-1234' }, keys), true); // últimos 8 dígitos
  assert.equal(isBillingCustomer({ company: 'Otra', phone: '011 4444-9999' }, keys), false);
  assert.equal(isBillingCustomer({ company: 'Aislaciones del Sur' }, null), false);
  assert.equal(isBillingCustomer({ company: '' , phone: ''}, keys), false);
});

test('el cliente de Contabilium sale de la cola y el resto sigue igual', () => {
  const prospects = [{ ...base, id: 'a', company: 'Aislaciones del Sur SRL', phone: '1' }, { ...base, id: 'b', company: 'Nueva Obra', phone: '1' }];
  assert.deepEqual(buildQueue(prospects, new Map(), { customers: keys }), ['b']);
  assert.deepEqual(buildQueue(prospects, new Map()), ['a', 'b']);
  assert.equal(prospectScore(prospects[0], { status: 'Nuevo' }, DEFAULT_RULES, keys), -50);
});

test('reseñas del mapa: 4 estrellas con 10+ suman, con 50+ el doble, sin datos nada', () => {
  assert.equal(reviewPoints({ rating: 4.5, reviews: 12 }), 1);
  assert.equal(reviewPoints({ rating: 4.2, reviews: 80 }), 2);
  assert.equal(reviewPoints({ rating: 3.9, reviews: 80 }), 0);
  assert.equal(reviewPoints({ rating: 4.8, reviews: 5 }), 0);
  assert.equal(reviewPoints({}), 0);
  assert.equal(reviewPoints({ rating: 4.5, reviews: 12 }, { signalReviews: 3 }), 3);
  assert.equal(reviewLabel({ rating: 4.5, reviews: 12 }), '4,5 ★ · 12 reseñas en el mapa');
  assert.equal(reviewLabel({}), '');
});

test('las reseñas suben en la cola y la regla es editable', () => {
  const withReviews = { ...base, id: 'r', rating: 4.6, reviews: 60 };
  assert.equal(prospectScore(withReviews, { status: 'Nuevo' }, DEFAULT_RULES) - prospectScore(base, { status: 'Nuevo' }, DEFAULT_RULES), 2);
  assert.equal(normalizeRules({ signalReviews: 99 }).signalReviews, 5);
});

test('Google Maps trae puntaje y cantidad de reseñas', () => {
  const [row] = normalizeGoogle({ places: [{ id: 'g', displayName: { text: 'Pileta Sur' }, rating: 4.4, userRatingCount: 31 }] });
  assert.equal(row.rating, 4.4);
  assert.equal(row.reviews, 31);
  assert.equal(normalizeGoogle({ places: [{ id: 'h', displayName: { text: 'Sin datos' } }] })[0].rating, null);
});
