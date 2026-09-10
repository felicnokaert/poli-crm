import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuggestion, PENDING_TECHNICAL_FIELDS } from '../src/suggestion-rules.mjs';

test('detects family and intent from keywords with rule provenance', () => {
  const suggestion = buildSuggestion({ channel: 'penosil', text_body: 'Hola, necesito precio de Penosil para sellar juntas' });
  assert.equal(suggestion.family, 'Penosil');
  assert.equal(suggestion.intent, 'Precio / cotización');
  assert.equal(suggestion.provenance.family, 'regla_aprobada');
  assert.equal(suggestion.provenance.intent, 'regla_aprobada');
});

test('falls back to "Sin definir" family without inventing one', () => {
  const suggestion = buildSuggestion({ channel: 'general', text_body: 'hola' });
  assert.equal(suggestion.family, 'Sin definir');
  assert.deepEqual(suggestion.missingQuestions, ['¿Qué producto o familia le interesa?', '¿Cuál es la aplicación que tiene en mente?']);
});

test('a generic Penosil opening on the penosil channel is treated as Penosil interest', () => {
  const suggestion = buildSuggestion({ channel: 'penosil', text_body: 'Quiero más información' });
  assert.equal(suggestion.family, 'Penosil');
});

test('temperature reflects urgency plus commercial intent, never invented', () => {
  assert.equal(buildSuggestion({ text_body: 'necesito cotizar urgente para hoy' }).temperature, 'Caliente');
  assert.equal(buildSuggestion({ text_body: 'quiero cotizar precio' }).temperature, 'Tibio');
  assert.equal(buildSuggestion({ text_body: 'hola, buen dia' }).temperature, 'Frío');
});

test('recommends technical documents by family without asserting their content', () => {
  const suggestion = buildSuggestion({ text_body: 'consulta sobre isoBUNKER poliuretano rígido' });
  assert.equal(suggestion.family, 'Poliuretano');
  assert.ok(suggestion.recommendedDocs.length > 0);
  for (const doc of suggestion.recommendedDocs) {
    assert.equal(doc.verified, false);
    assert.ok(!('content' in doc));
  }
  assert.equal(suggestion.provenance.recommendedDocs, 'metadata_ficha');
});

test('every technical field is explicitly pending, never a guessed value', () => {
  const suggestion = buildSuggestion({ text_body: 'cuanto rinde el producto y que precio tiene' });
  for (const field of PENDING_TECHNICAL_FIELDS) {
    assert.equal(suggestion.technicalFields[field], 'Pendiente de verificar (sin ficha validada)');
  }
  assert.equal(suggestion.provenance.technicalFields, 'pendiente_de_validacion');
});

test('cites a real excerpt only from a vigente, validated ficha with extracted text - the one path where a technical field stops being pending', () => {
  const vigenteConTexto = {
    id: 'doc-1', family: 'Poliuretano', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica',
    status: 'vigente', sourceUrl: 'https://drive.google.com/x', verifiedBy: 'user-1', verifiedAt: '2026-09-10T00:00:00Z',
    extractedText: 'Rendimiento: 1 kg de mezcla rinde 30 litros de espuma expandida',
  };
  const suggestion = buildSuggestion({ text_body: 'consulta sobre isoBUNKER poliuretano rígido' }, { documents: [vigenteConTexto] });
  assert.equal(suggestion.family, 'Poliuretano');
  assert.match(suggestion.technicalFields.rendimiento, /Rendimiento: 1 kg de mezcla rinde 30 litros/);
  assert.match(suggestion.technicalFields.rendimiento, /isoBUNKER 619-SP/);
  // Nunca de precio/stock, ni de campos sin coincidencia literal en el texto.
  assert.equal(suggestion.technicalFields.precio, 'Pendiente de verificar (sin ficha validada)');
  assert.equal(suggestion.technicalFields.compatibilidad, 'Pendiente de verificar (sin ficha validada)');
  assert.equal(suggestion.provenance.technicalFields, 'ficha_vigente_validada');
});

test('does not cite a non-vigente or unvalidated ficha even if its text has the keyword', () => {
  const sinValidar = {
    id: 'doc-2', family: 'Poliuretano', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica',
    status: 'inventariado', extractedText: 'Rendimiento: 30 litros por kg',
  };
  const suggestion = buildSuggestion({ text_body: 'consulta sobre isoBUNKER poliuretano rígido' }, { documents: [sinValidar] });
  assert.equal(suggestion.technicalFields.rendimiento, 'Pendiente de verificar (sin ficha validada)');
  assert.equal(suggestion.provenance.technicalFields, 'pendiente_de_validacion');
});

test('draft message never states a technical claim, only cites doc names and asks questions', () => {
  const suggestion = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano para techo' });
  assert.ok(suggestion.draftMessage.includes('Pendiente de verificar'));
  assert.ok(!/rinde \d|kg\/m|resistente a|compatible con \w+ °c/i.test(suggestion.draftMessage));
  for (const doc of suggestion.recommendedDocs) {
    assert.ok(suggestion.draftMessage.includes(doc.product));
  }
});

test('a short closing/thank-you message does not trigger a diagnostic questionnaire', () => {
  for (const text of ['Gracias!', 'muchas gracias', 'Dale', 'perfecto', 'Ok, gracias!']) {
    const suggestion = buildSuggestion({ text_body: text });
    assert.equal(suggestion.isClosingMessage, true, `expected "${text}" to be detected as closing`);
    assert.deepEqual(suggestion.missingQuestions, []);
    assert.deepEqual(suggestion.recommendedDocs, []);
    assert.match(suggestion.draftMessage, /historial/i);
    assert.doesNotMatch(suggestion.draftMessage, /qué producto/i);
  }
});

test('a longer message that happens to start with a closing word is not misclassified', () => {
  const suggestion = buildSuggestion({ text_body: 'Gracias, pero necesito cotizar 200 litros de resina para un proyecto grande' });
  assert.equal(suggestion.isClosingMessage, false);
  assert.ok(suggestion.missingQuestions.length > 0);
});

test('a complaint gets ownership questions, not a product pitch', () => {
  const suggestion = buildSuggestion({ text_body: 'Llegó roto el pedido, quiero hacer un reclamo' });
  assert.equal(suggestion.intent, 'Reclamo');
  assert.deepEqual(suggestion.missingQuestions, ['¿A qué pedido, factura o remito corresponde?', '¿Qué pasó exactamente (rotura, faltante, producto vencido, error de envío)?', '¿Cuándo lo recibió?']);
  assert.deepEqual(suggestion.recommendedDocs, []);
  assert.match(suggestion.nextAction, /disculpas/i);
  assert.match(suggestion.draftMessage, /Lamentamos el inconveniente/);
  assert.doesNotMatch(suggestion.draftMessage, /recomendarte un producto/i);
});

test('a post-sale question is not treated as a new commercial opening', () => {
  const suggestion = buildSuggestion({ text_body: 'Necesito la factura de mi pedido anterior' });
  assert.equal(suggestion.intent, 'Postventa');
  assert.deepEqual(suggestion.recommendedDocs, []);
  assert.match(suggestion.nextAction, /Contabilium|remito/i);
  assert.match(suggestion.draftMessage, /sobre tu pedido/);
});

test('detects family from a real product name in the live catalog when generic keywords find nothing', () => {
  const documents = [{ id: 'd1', family: 'Poliuretano', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica', sourceFile: 'x.pdf', status: 'inventariado' }];
  const suggestion = buildSuggestion({ text_body: 'hola, necesito el isoBUNKER 619-SP para un techo' }, { documents });
  assert.equal(suggestion.family, 'Poliuretano');
  assert.equal(suggestion.provenance.family, 'metadata_ficha');
});

test('a generic FAMILY_RULES keyword still wins over a product-name match (rule provenance takes priority)', () => {
  const documents = [{ id: 'd1', family: 'Resinplast', product: 'Máquina especial', docType: 'ficha_tecnica', sourceFile: 'x.pdf', status: 'inventariado' }];
  const suggestion = buildSuggestion({ text_body: 'necesito una máquina especial purmac' }, { documents });
  assert.equal(suggestion.family, 'PURMAC');
  assert.equal(suggestion.provenance.family, 'regla_aprobada');
});

test('ignores very short product names to avoid false-positive family matches', () => {
  const documents = [{ id: 'd1', family: 'PURMAC', product: 'PM-4', docType: 'ficha_tecnica', sourceFile: 'x.pdf', status: 'inventariado' }];
  const suggestion = buildSuggestion({ text_body: 'hola, quiero comprar algo' }, { documents });
  assert.equal(suggestion.family, 'Sin definir');
});

test('a message with messageCount > 1 is flagged as follow-up, does not repeat the opening greeting', () => {
  const suggestion = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano', messageCount: 4 });
  assert.equal(suggestion.isFollowUp, true);
  assert.match(suggestion.nextAction, /historial/i);
  assert.match(suggestion.draftMessage, /seguimiento/i);
  assert.doesNotMatch(suggestion.draftMessage, /Gracias por escribirnos/);
});

test('a first message (messageCount 1 or missing) is not treated as a follow-up', () => {
  assert.equal(buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano', messageCount: 1 }).isFollowUp, false);
  assert.equal(buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano' }).isFollowUp, false);
});

test('follow-up framing does not apply to closing messages or reclamo/postventa - those already have their own tone', () => {
  const closing = buildSuggestion({ text_body: 'Gracias!', messageCount: 5 });
  assert.doesNotMatch(closing.draftMessage, /seguimiento/i);
  const reclamo = buildSuggestion({ text_body: 'llegó roto el pedido, reclamo', messageCount: 5 });
  assert.doesNotMatch(reclamo.draftMessage, /seguimiento/i);
});

test('handles missing/empty event fields without throwing', () => {
  assert.doesNotThrow(() => buildSuggestion());
  assert.doesNotThrow(() => buildSuggestion({}));
  const suggestion = buildSuggestion({ text_body: '' });
  assert.equal(suggestion.family, 'Sin definir');
});
