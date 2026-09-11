import assert from 'node:assert/strict';
import test from 'node:test';
import { lastPurchaseForClient } from '../src/client-purchase-history.mjs';

const sales = [
  { customer: 'Poliplast SA', date: '2026-08-05', unit: 'Poliplast', items: [{ description: 'isoBUNKER 619-SP' }] },
  { customer: 'poliplast sa', date: '2026-09-10', unit: 'Poliocho', items: [{ description: 'Airless 390' }, { description: 'isoBUNKER 619-SP' }] },
  { customer: 'Otro Cliente', date: '2026-09-20', unit: 'Poliplast', items: [{ description: 'Resina X' }] },
];

test('finds the most recent invoice by normalized company name, ignoring case/accents', () => {
  const result = lastPurchaseForClient({ company: 'Poliplast SA' }, sales);
  assert.equal(result.date, '2026-09-10');
  assert.equal(result.unit, 'Poliocho');
  assert.deepEqual(result.products, ['Airless 390', 'isoBUNKER 619-SP']);
  assert.equal(result.invoiceCount, 2);
});

test('also matches by legalName when company does not match the invoice razón social', () => {
  const result = lastPurchaseForClient({ company: 'Mi Cliente Comercial', legalName: 'Otro Cliente' }, sales);
  assert.equal(result.date, '2026-09-20');
});

test('returns null - never invents - when no invoice matches this client', () => {
  assert.equal(lastPurchaseForClient({ company: 'Nadie Compro Nunca' }, sales), null);
  assert.equal(lastPurchaseForClient({}, sales), null);
  assert.equal(lastPurchaseForClient({ company: 'Poliplast SA' }, []), null);
});

test('ignores sales without a date', () => {
  const result = lastPurchaseForClient({ company: 'Sin Fecha SA' }, [{ customer: 'Sin Fecha SA', date: '', items: [] }]);
  assert.equal(result, null);
});
