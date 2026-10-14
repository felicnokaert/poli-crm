import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchPrompt, exclusionNames, playbookFor, RESEARCH_COLUMNS } from '../src/prospect-playbook.mjs';
import { buildImportPlan, parseProspectsText } from '../src/prospect-import.mjs';

test('el prompt trae público, señales, exclusiones propias, alcance, columnas y la regla de no inventar', () => {
  const prompt = buildResearchPrompt({ family: 'Penosil', scope: 'Entre Ríos y Córdoba', count: 25, exclusions: ['Ferrenet', 'Herracenter SRL'] });
  assert.match(prompt, /familia Penosil/);
  assert.match(prompt, /Fischer, Sika, Tekbond/);
  assert.match(prompt, /Ferrenet; Herracenter SRL/);
  assert.match(prompt, /ALCANCE GEOGRÁFICO: Entre Ríos y Córdoba/);
  assert.match(prompt, /hasta 25 empresas/);
  assert.match(prompt, /no inventes datos/);
  for (const column of RESEARCH_COLUMNS) assert.ok(prompt.includes(column));
});

test('Química pide aparte los distribuidores tipo Transitflow y Carrozados excluye revendedores', () => {
  assert.match(buildResearchPrompt({ family: 'Química' }), /Transitflow/);
  assert.match(buildResearchPrompt({ family: 'Carrozados' }), /Revendedores o distribuidores de insumos/);
  assert.equal(playbookFor('Baldes').known, false);
  assert.match(buildResearchPrompt({ family: 'Baldes' }), /heladería/);
});

test('las exclusiones salen de empresas y prospectos, sin repetir y con tope', () => {
  const names = exclusionNames([{ company: 'A' }, { company: 'B' }], [{ company: 'A' }, { company: ' C ' }, { company: '' }]);
  assert.deepEqual(names, ['A', 'B', 'C']);
  assert.equal(exclusionNames(Array.from({ length: 200 }, (_, i) => ({ company: `E${i}` }))).length, 80);
});

const TABLE = `| # | Nombre | Ubicación | Tipo | Evidencia | Tamaño |
|---|---|---|---|---|---|
| 1 | Ferromundo | Neuquén cap./Centenario, Río Negro | Corralón+ferret. | Fischer PU 1/500 (https://x.com/a) | 4 sucursales |
| 2 | Ferrenet | Paraná, Entre Ríos | Ferret. industrial ISO 9001 | Fischer aerosol | ISO 9001 |`;

test('una tabla markdown de una IA se importa con ciudad, provincia, rubro y evidencia en notas', () => {
  const { rows, error } = parseProspectsText(TABLE);
  assert.equal(error, '');
  assert.equal(rows.length, 2);
  const plan = buildImportPlan(rows, [{ id: 'c1', company: 'Ferrenet', city: 'Paraná' }], [], { now: '2026-10-14T00:00:00Z', makeId: (() => { let n = 0; return () => `p${++n}`; })() });
  assert.equal(plan.counts.nuevas, 1);
  assert.equal(plan.counts.enCrm, 1);
  const item = plan.items[0].prospect;
  assert.equal(item.company, 'Ferromundo');
  assert.equal(item.city, 'Neuquén cap./Centenario');
  assert.equal(item.province, 'Río Negro');
  assert.equal(item.rubro, 'Corralón+ferret.');
  assert.match(item.notes, /Evidencia: Fischer PU 1\/500 \(https:\/\/x\.com\/a\)/);
  assert.match(item.notes, /Tamaño: 4 sucursales/);
  assert.equal(item.source, 'importado');
});
