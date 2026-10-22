import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learningContext, prospectLearning, routeFor, teamNotes, asksLearning } from '../src/assistant-team.mjs';

test('derivar: máquinas a Juan, resinas poliéster a Ezequiel', () => {
  assert.equal(routeFor('necesito un repuesto de la maquina graco')[0].who, 'Juan');
  assert.equal(routeFor('gel coat para piscinas')[0].who, 'Ezequiel');
  assert.deepEqual(routeFor('cuanto rinde el easyspray'), []);
});

test('lo que anotó el equipo: historial y notas que hablan del tema', () => {
  const lines = teamNotes('objeción de precio con easyspray', {
    interactions: [
      { company: 'ACME', createdAt: '2026-10-01', summary: 'Dijo que el easyspray le salió caro, le explicamos el rendimiento por m2 (precio por m2).' },
      { company: 'Otra', createdAt: '2026-10-02', summary: 'Pidió catálogo.' },
    ],
    clients: [{ company: 'Lavopa', notes: '01/09/2026: compara precio con Integral\n02/09/2026: llamar' }],
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /ACME/);
});

test('qué aprendimos: por versión, familia y motivo de rechazo', () => {
  const prospects = [
    { id: '1', history: [{ state: 'Contactado', variant: 'A', family: 'Espuma', zone: 'A' }, { state: 'Con interés', variant: 'A' }] },
    { id: '2', history: [{ state: 'Sin interés', outcome: 'Precio', variant: 'B', family: 'Espuma', zone: 'B' }] },
    { id: '3', history: [{ state: 'Sin interés', outcome: 'Precio', variant: 'B', family: 'Resinas', zone: 'B' }] },
    { id: '4', history: [] },
  ];
  const clients = [{ company: 'X', contactLog: [{ queue: 'reactivar', outcome: 'Respondió, sigue interesado' }, { queue: 'cotizaron', outcome: 'Dólar' }] }];
  const stats = prospectLearning({ prospects, clients });
  assert.equal(stats.contacted, 3);
  assert.equal(stats.interested, 1);
  assert.deepEqual(stats.byVariant.map((row) => [row.key, row.interested, row.contacted]), [['Versión B', 0, 2], ['Versión A', 1, 1]]);
  assert.deepEqual(stats.reasons[0], { reason: 'Precio', count: 2 });
  assert.equal(stats.byQueue.length, 2);
  assert.match(learningContext(stats), /Motivos de rechazo: Precio 2/);
  assert.ok(asksLearning('qué mensaje funciona mejor?'));
});
