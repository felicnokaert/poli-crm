import test from 'node:test';
import assert from 'node:assert/strict';
import { prospectFieldsFromRow } from '../src/prospect-import.mjs';
import { buildResearchPrompt } from '../src/prospect-playbook.mjs';

test('Prospección: el pedido pide «Valor N/10» y el importador lo toma como puntaje', () => {
  assert.match(buildResearchPrompt({ family: 'Resinplast', scope: 'Mar del Plata', count: 10, exclusions: [], notes: '' }), /Valor N\/10/);
  assert.equal(prospectFieldsFromRow({ company: 'Frío Sur', fit: 'Valor 8/10 · paneles de frío' }).sheetScore, 8);
  assert.equal(prospectFieldsFromRow({ company: 'Otra', fit: 'Valor 9/10', sheetScore: '60' }).sheetScore, 60);
});
