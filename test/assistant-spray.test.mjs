import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSprayAsk, sprayFor, sprayQuote } from '../src/assistant-spray.mjs';
import { parseFoamAsk } from '../src/assistant-foam.mjs';

const FICHA = {
  title: 'isoBUNKER 618-SP',
  extractedText: `poli-plus : iso-plus 100 : 110 Gramos\n Densidad Global Kg/m3 36 - 40 ASTM D 1622\n Densidad Núcleo Kg/m3 28 - 32\n poli-plus (Componente A) = Tambor Metálico x 220 Kg.\n iso-plus (Componente B) = Tambor Metálico x 250 Kg.`,
};
const ASK = 'Cliente que aplica spray en chapa sinusoidal por 1845 m2, rinde 1.5 kg/m2, tambores cerrados, cuántos sistemas necesita con isobunker 618-SP';

test('1.845 m² de chapa: +10 % = 2.029,5 m², 3.044 kg, poliol 1.450 e iso 1.595, 7 sistemas (3.290 kg)', () => {
  const quote = sprayFor(ASK, [FICHA]);
  assert.equal(quote.extraPct, 10);
  assert.equal(quote.effM2, 2029.5);
  assert.equal(quote.totalKg, 3044.3);
  assert.equal(Math.round(quote.split.poliol), 1450);
  assert.equal(Math.round(quote.split.iso), 1595);
  assert.equal(quote.systems.count, 7);
  assert.equal(quote.systems.closedKg, 3290);
  assert.equal(quote.systems.leftoverKg, 246);
  assert.equal(quote.systems.limiting, 'poliol');
  assert.equal(quote.systems.coversM2, 1960);
});

test('losa o madera no suman extra, y la chapa muy curva pide +20 %', () => {
  assert.equal(sprayFor('spray en losa 500 m2 rinde 1.5 kg/m2 cuántos sistemas 618-SP', [FICHA]).extraPct, 0);
  assert.equal(sprayFor('spray en chapa 500 m2 +20% rinde 1.5 kg/m2 cuántos sistemas 618-SP', [FICHA]).extraPct, 20);
});

test('sin sustrato avisa que hay que aclararlo; con espesor calcula el rinde con la densidad global', () => {
  const sinSustrato = sprayFor('aplicar spray 200 m2 rinde 1.5 kg/m2 cuántos sistemas 618-SP', [FICHA]);
  assert.ok(sinSustrato.notes.some((note) => /sustrato/.test(note)));
  const porEspesor = sprayFor('spray en losa 1000 m2 espesor 30 mm cuántos sistemas 618-SP', [FICHA]);
  assert.equal(porEspesor.kgPerM2, 1.14);
});

test('el margen corto se avisa, y no se confunde con boyas, poliurea ni precios', () => {
  const ajustado = sprayFor('spray en chapa 1960 m2 rinde 1.5 kg/m2 cuántos sistemas 618-SP', [FICHA]);
  assert.ok(ajustado.notes.some((note) => /margen es corto/.test(note)));
  assert.equal(parseSprayAsk('cotizar 200 m2 de poliurea con top kg'), null);
  assert.equal(parseSprayAsk('cuánto cuesta spray de 200 m2'), null);
  assert.equal(parseFoamAsk(ASK), null);
  assert.equal(sprayQuote(parseSprayAsk(ASK), null).systems, null);
});
