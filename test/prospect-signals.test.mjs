import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSignals, signalPoints } from '../src/prospect-signals.mjs';
import { DEFAULT_RULES, normalizeRules } from '../src/prospect-rules.mjs';
import { prospectScore } from '../src/prospect-queue.mjs';
import { scoreAgainstFamily } from '../lib/prospect-research.mjs';

test('detecta rubros, aplicador y competidor en el texto del sitio', () => {
  const signals = detectSignals([{ text: 'Somos aplicadores de poliuretano y poliurea. Realizamos aislación e impermeabilización de techos.' }]);
  const keys = signals.map((item) => item.key);
  assert.ok(keys.includes('rubros') && keys.includes('aplicador'));
  assert.ok(signals.find((item) => item.key === 'rubros').found.includes('poliuretano'));
  const withCompetitor = detectSignals(['Trabajamos con Alkanos y espuma']);
  assert.ok(withCompetitor.some((item) => item.key === 'competidor'));
  assert.deepEqual(detectSignals(['Venta de flores y plantas']), []);
});

test('los puntos salen de las reglas editables y los rubros tienen tope 3', () => {
  const signals = [{ key: 'rubros', found: ['espuma', 'poliuretano', 'poliurea', 'resina'] }, { key: 'aplicador', found: ['aplicamos'] }, { key: 'competidor', found: ['Alkanos'] }];
  assert.equal(signalPoints(signals, DEFAULT_RULES), 3 + 3 + 1);
  assert.equal(signalPoints(signals, normalizeRules({ signalRubros: 2, signalApplicator: 0, signalCompetitor: 0 })), 6);
  assert.equal(signalPoints(undefined, DEFAULT_RULES), 0);
});

test('las señales suben el puntaje de la cola y quedan en la investigación', () => {
  const base = { id: 'a', state: 'No contactado', phone: '+5491112345678' };
  const sin = prospectScore(base);
  const con = prospectScore({ ...base, research: { score: 0, signals: [{ key: 'aplicador', found: ['aplicamos'] }] } });
  assert.equal(con - sin, 3);
  const research = scoreAgainstFamily({ family: 'Poliuretano', texts: [{ url: 'x', text: 'Aplicamos poliuretano en obras' }] });
  assert.ok(research.signals.some((item) => item.key === 'aplicador'));
  assert.ok(research.reasoning.some((line) => line.startsWith('Señal:')));
});
