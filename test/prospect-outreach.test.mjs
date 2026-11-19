import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreachDraft, fitLine, playbookFor } from '../src/prospect-outreach.mjs';

test('elige la guía comercial según rubro y familia', () => {
  assert.equal(playbookFor({ family: 'Penosil', rubro: 'ferretería' }).id, 'penosil');
  assert.equal(playbookFor({ family: 'Resinplast', rubro: 'astillero' }).id, 'prfv');
  assert.equal(playbookFor({ family: 'PURMAC', rubro: 'aplicador de poliuretano proyectado' }).id, 'aplicadores');
  assert.equal(playbookFor({ family: 'Planchas', rubro: 'cámaras frigoríficas' }).id, 'frigorificas');
  assert.equal(playbookFor({ family: 'Carrozados', rubro: 'carrocería' }).id, 'carrozados');
});

test('el borrador usa solo datos de la ficha y no inventa precios ni números', () => {
  const draft = buildOutreachDraft({ company: 'Astillero Sur', family: 'Resinplast', rubro: 'astillero', city: 'Tigre', notes: 'Evidencia: x\nPor qué encaja: fabrica lanchas de PRFV.' }, { sender: 'Marta' });
  assert.match(draft.whatsapp, /Astillero Sur/);
  assert.match(draft.whatsapp, /Marta de Grupo Poliplast/);
  assert.match(draft.whatsapp, /fabrica lanchas de PRFV/);
  assert.doesNotMatch(draft.whatsapp, /\$|precio|descuento|\d+%/i);
  assert.ok(draft.usesResearch);
  assert.match(draft.email.subject, /Astillero Sur/);
  assert.match(draft.call, /1\) Presentate/);
});

test('sin investigación cae al rubro y ciudad, y avisa qué falta', () => {
  const draft = buildOutreachDraft({ company: 'Ferretería Norte', family: 'Penosil', rubro: 'ferretería' });
  assert.match(draft.whatsapp, /Vi que trabajan en ferretería/);
  assert.match(draft.whatsapp, /\[tu nombre\]/);
  assert.deepEqual(draft.missing, ['ciudad']);
  assert.equal(fitLine({ notes: 'nada' }), '');
});

test('nombra las líneas del catálogo y ofrece un seguimiento sin "alguna novedad"', () => {
  const draft = buildOutreachDraft({ company: 'Ferretería Norte', family: 'Penosil', rubro: 'ferretería', city: 'Rosario' }, { sender: 'Marta' });
  assert.match(draft.whatsapp, /selladores, espumas y adhesivos Penosil/);
  assert.match(draft.followUp, /Ferretería Norte/);
  assert.doesNotMatch(draft.followUp, /novedad/i);
});

test('Adheplast arma su propio mensaje (muebles, aberturas) sin precios ni líneas de otras familias', () => {
  const muebles = buildOutreachDraft({ company: 'Muebles Sur', family: 'Adheplast', rubro: 'fábrica de muebles' }, { sender: 'Felipe', variant: 'A' });
  assert.match(muebles.whatsapp, /Soy Felipe, de Grupo Poliplast/);
  assert.match(muebles.whatsapp, /Vi que fabrican muebles en Muebles Sur/);
  assert.match(muebles.whatsapp, /encolado de cantos, tarugos o enchapados/);
  assert.match(muebles.whatsapp, /monocomponente/);
  assert.doesNotMatch(muebles.whatsapp, /\$|precio|descuento|poliuretano|fibra de vidrio|\d+%/i);
  const corto = buildOutreachDraft({ company: 'X', family: 'Adheplast', rubro: 'carpintería' }, { sender: 'Felipe', variant: 'B' });
  assert.match(corto.whatsapp, /Vi que trabajan en carpintería/);
  const puertas = buildOutreachDraft({ company: 'Y', family: 'Adheplast', rubro: 'fábrica de aberturas de madera' }, { sender: 'Felipe' });
  assert.match(puertas.whatsapp, /aberturas de madera/);
  assert.doesNotMatch(puertas.whatsapp, /tarugos/);
  assert.match(muebles.email.body, /monocomponente/);
});
