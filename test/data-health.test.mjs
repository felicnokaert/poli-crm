import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, healthSummary, contabiliumRows, mlAccountRows, ageText } from '../src/data-health.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const ago = (hours) => new Date(now - hours * 3600 * 1000).toISOString();

test('al día, atrasada y muy atrasada según el plazo', () => {
  assert.equal(evaluate({ at: ago(5), maxHours: 36 }, now).status, 'ok');
  assert.equal(evaluate({ at: ago(40), maxHours: 36 }, now).status, 'late');
  assert.equal(evaluate({ at: ago(120), maxHours: 36 }, now).status, 'old');
});

test('sin datos, sin configurar y con error', () => {
  assert.equal(evaluate({ at: null }, now).status, 'empty');
  assert.equal(evaluate({ at: null, optional: true }, now).status, 'idle');
  assert.equal(evaluate({ at: ago(1), error: 'timeout' }, now).status, 'error');
});

test('columnas de solo fecha cuentan al mediodía argentino', () => {
  assert.equal(evaluate({ at: '2026-10-24', dateOnly: true, maxHours: 36 }, now).status, 'ok');
  assert.equal(evaluate({ at: '2026-10-19', dateOnly: true, maxHours: 36 }, now).status, 'old');
});

test('textos de antigüedad y resumen', () => {
  assert.equal(ageText(0.2), 'hace minutos');
  assert.equal(ageText(5), 'hace 5 h');
  assert.equal(ageText(72), 'hace 3 días');
  const rows = [{ status: 'ok' }, { status: 'late', label: 'A' }, { status: 'error', label: 'B' }];
  const summary = healthSummary(rows);
  assert.equal(summary.attention, 2);
  assert.equal(summary.worst.label, 'B');
});

test('filas de Contabilium y de cuentas de Mercado Libre', () => {
  const rows = contabiliumRows([{ company: 'POLIPLAST', last_run_at: ago(3), history_done: false, total_saved: 100 }, { company: 'COMARG:clientes', last_run_at: ago(100), last_error: 'x' }], now);
  assert.match(rows[0].label, /copiando el historial/);
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[1].status, 'error');
  const accounts = mlAccountRows([{ seller_id: '1', nickname: 'POLIPLAST', last_sync_at: ago(2), last_refresh_at: null }], now);
  assert.equal(accounts.length, 2);
  assert.equal(accounts[1].status, 'empty');
});
