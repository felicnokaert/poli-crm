import test from 'node:test';
import assert from 'node:assert/strict';
import { fichaMixData, foamFor, foamQuote, parseFoamAsk, pickFoamDoc } from '../src/assistant-foam.mjs';

const FICHA = {
  title: 'isoBUNKER 770-IR', product: 'isoBUNKER 770-IR',
  extractedText: `Características de Reacción\n Relación de mezcla 1:1 Volumen\n isobunker : iso-plus 100 : 110 Gramos\n Densidad Libre Kg/m3 25 – 30 ASTM D 1622\n Densidad Moldeada Sugerida Kg/m3 33 – 40 ASTM D 1622\n poli-plus (Componente A) = Tambor Metálico x 200 Kg.\n iso-plus (Componente B) = Tambor Metálico x 250 Kg.`,
};
const ASK = 'Tengo un cliente que hace 1500 boyas de 2m3 cada boya, cuánto material necesita, densidad moldeada 38 kg m3, un conjunto de 470 KG: 220 KG DE POLIOL, 250 DE ISOCIANATO. isobunker 770-IR';

test('lee la ficha: relación en peso, densidad moldeada y tambores', () => {
  const data = fichaMixData(FICHA);
  assert.deepEqual(data.ratio, { poliol: 100, iso: 110 });
  assert.equal(data.densityMin, 33);
  assert.equal(data.densityMax, 40);
  assert.equal(data.drumPoliol, 200);
  assert.equal(data.drumIso, 250);
});

test('entiende la pregunta de las boyas', () => {
  const ask = parseFoamAsk(ASK);
  assert.equal(ask.count, 1500);
  assert.equal(ask.volumeM3, 2);
  assert.equal(ask.density, 38);
  assert.deepEqual(ask.kit, { poliol: 220, iso: 250 });
});

test('1.500 boyas de 2 m³ a 38 kg/m³: 114.000 kg, poliol 54.286 e iso 59.714, y el poliol manda en los juegos', () => {
  const quote = foamFor(ASK, [FICHA]);
  const row = quote.rows[0];
  assert.equal(row.perPieceKg, 76);
  assert.equal(row.totalKg, 114000);
  assert.equal(Math.round(row.base.poliol), 54286);
  assert.equal(Math.round(row.base.iso), 59714);
  assert.equal(row.kits.exact, 247);
  assert.equal(row.kits.withLoss, 260);
  assert.equal(row.kits.limiting, 'poliol');
  assert.ok(quote.notes.some((note) => /100 : 113/.test(note)), 'avisa que el juego no respeta 100:110');
  assert.ok(quote.notes.some((note) => /200 kg de poliol/.test(note)), 'avisa los tambores de la ficha');
});

test('sin densidad usa el rango de la ficha, y sin ficha ni densidad lo pide', () => {
  const sinDensidad = foamFor('cuánto material necesito para 10 moldes de 100 litros isobunker 770-IR', [FICHA]);
  assert.equal(sinDensidad.rows.length, 2);
  assert.equal(sinDensidad.rows[0].perPieceKg, 3.3);
  const sinNada = foamQuote(parseFoamAsk('cuánto material necesito para 10 moldes de 100 litros de espuma'), null);
  assert.equal(sinNada.rows.length, 0);
  assert.ok(sinNada.notes[0].includes('densidad'));
});

test('no se confunde con precios ni con otras preguntas', () => {
  assert.equal(parseFoamAsk('cuánto cuesta el isobunker de 1 m3'), null);
  assert.equal(parseFoamAsk('cuánto rinde el isobunker 770-IR'), null);
  assert.equal(parseFoamAsk('cotizar 200 m2 de poliurea con top'), null);
  assert.equal(pickFoamDoc('boyas de 2m3 densidad 38', [FICHA]), null);
});
