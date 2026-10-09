import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WEEKLY_TARGETS, normalizeTarget, resolveWeeklyTargets, shouldShowWelcome } from '../src/weekly-targets.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

test('los valores por defecto son los de siempre (lo que ve Felipe)', () => {
  assert.deepEqual(resolveWeeklyTargets(undefined), { contacts: '15', effective: '8–10', proposals: '2–3' });
  assert.deepEqual(resolveWeeklyTargets({}), DEFAULT_WEEKLY_TARGETS);
  assert.deepEqual(resolveWeeklyTargets(null), DEFAULT_WEEKLY_TARGETS);
});

test('normalizeTarget acepta números y rangos, y rechaza lo demás', () => {
  assert.equal(normalizeTarget('20'), '20');
  assert.equal(normalizeTarget(' 8-10 '), '8–10');
  assert.equal(normalizeTarget('8–10'), '8–10');
  assert.equal(normalizeTarget('8 a 10'), '8–10');
  assert.equal(normalizeTarget('10-8'), null);
  assert.equal(normalizeTarget(''), null);
  assert.equal(normalizeTarget('abc'), null);
  assert.equal(normalizeTarget('1234'), null);
  assert.equal(normalizeTarget(undefined), null);
});

test('resolveWeeklyTargets mezcla campo por campo e ignora valores inválidos', () => {
  assert.deepEqual(resolveWeeklyTargets({ contacts: '30', effective: 'xx' }), { contacts: '30', effective: '8–10', proposals: '2–3' });
});

test('la bienvenida solo aparece en un espacio vacío y no cerrado', () => {
  assert.equal(shouldShowWelcome({ clients: [], interactions: [], tasks: [], sales: [] }), true);
  assert.equal(shouldShowWelcome({}), true);
  assert.equal(shouldShowWelcome({ clients: [{ id: 'c1' }] }), false);
  assert.equal(shouldShowWelcome({ tasks: [{ id: 't1' }] }), false);
  assert.equal(shouldShowWelcome({ welcomeDismissed: true }), false);
});

test('el merge conserva las metas y la bienvenida cerrada, y no agrega claves a quien no las usa', () => {
  const plain = mergeWorkspaceState({}, {});
  assert.equal('weeklyTargets' in plain, false);
  assert.equal('welcomeDismissed' in plain, false);
  const withTargets = mergeWorkspaceState({ weeklyTargets: { contacts: '20' } }, { welcomeDismissed: true });
  assert.deepEqual(withTargets.weeklyTargets, { contacts: '20' });
  assert.equal(withTargets.welcomeDismissed, true);
  assert.deepEqual(mergeWorkspaceState({}, { weeklyTargets: { contacts: '9' } }).weeklyTargets, { contacts: '9' });
});
