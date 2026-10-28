import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_IDEAS, bubblePositions, mergeIdeas, newIdea, patchIdea, sortIdeas, verdictCounts, verdictFor } from '../src/automation-matrix.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

test('el veredicto sale de impacto, facilidad, costo y riesgo', () => {
  assert.equal(verdictFor({ impact: 5, ease: 5, cost: 0 }), 'ya');
  assert.equal(verdictFor({ impact: 4, ease: 4, cost: 1 }), 'ya');
  assert.equal(verdictFor({ impact: 4, ease: 4, cost: 1, human: true }), 'copiloto');
  assert.equal(verdictFor({ impact: 5, ease: 2, cost: 2, risk: true }), 'copiloto');
  assert.equal(verdictFor({ impact: 4, ease: 2, cost: 0 }), 'copiloto');
  assert.equal(verdictFor({ impact: 3, ease: 5, cost: 0 }), 'quick');
  assert.equal(verdictFor({ impact: 2, ease: 4, cost: 0 }), 'quick');
  assert.equal(verdictFor({ impact: 2, ease: 2, cost: 0 }), 'no');
  assert.equal(verdictFor({ impact: 1, ease: 1, cost: 3 }), 'no');
});

test('las ideas de partida tienen veredicto y las cuatro categorías aparecen', () => {
  const ideas = mergeIdeas({});
  assert.equal(ideas.length, SEED_IDEAS.length);
  const counts = verdictCounts(ideas);
  for (const key of ['ya', 'copiloto', 'quick', 'no']) assert.ok(counts[key] > 0, key);
  assert.equal(ideas.find((idea) => idea.id === 'ml-clips').verdict, 'no');
  assert.equal(ideas.find((idea) => idea.id === 'redes-agente').verdict, 'copiloto');
});

test('editar, agregar y quitar ideas', () => {
  let saved = patchIdea({}, 'ml-clips', { impact: 5, ease: 5 });
  assert.equal(mergeIdeas(saved).find((idea) => idea.id === 'ml-clips').verdict, 'ya');
  saved = newIdea(saved, { name: 'Mi idea nueva', impact: 5, ease: 5, cost: 0 });
  const custom = mergeIdeas(saved).find((idea) => idea.custom);
  assert.equal(custom.name, 'Mi idea nueva');
  assert.equal(custom.verdict, 'ya');
  saved = patchIdea(saved, custom.id, { removed: true });
  assert.equal(mergeIdeas(saved).some((idea) => idea.custom), false);
  assert.deepEqual(newIdea({}, { name: '  ' }), {});
});

test('el orden pone lo que conviene hacer ya primero y las burbujas no se pisan', () => {
  const sorted = sortIdeas(mergeIdeas({}));
  assert.equal(sorted[0].verdict, 'ya');
  assert.equal(sorted.at(-1).verdict, 'no');
  const spots = bubblePositions(sorted).map((item) => `${item.left.toFixed(1)}|${item.bottom.toFixed(1)}`);
  assert.equal(new Set(spots).size, spots.length);
});

test('lo editado sobrevive a la sincronización del espacio de trabajo', () => {
  const merged = mergeWorkspaceState({ automations: { 'ml-clips': { impact: 5 } } }, { automations: { 'wa-bot': { cost: 1 } } });
  assert.deepEqual(Object.keys(merged.automations).sort(), ['ml-clips', 'wa-bot']);
});
