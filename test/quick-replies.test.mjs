import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_REPLIES, QUICK_GROUPS, fillReply, searchReplies } from '../src/quick-replies.mjs';
import { OBJECTIONS } from '../src/commercial-knowledge.mjs';

test('hay una respuesta rápida por cada objeción de la Academia comercial', () => {
  const objections = QUICK_REPLIES.filter((item) => item.group === 'objecion');
  assert.ok(objections.length >= OBJECTIONS.length - 2, `${objections.length} respuestas de objeción`);
});

test('todas pertenecen a un grupo conocido, con texto y sin ids repetidos', () => {
  const groups = new Set(QUICK_GROUPS.map(([key]) => key));
  const ids = new Set();
  for (const item of QUICK_REPLIES) {
    assert.ok(groups.has(item.group), item.title);
    assert.ok(item.text.length > 20, item.title);
    assert.ok(!ids.has(item.id), `id repetido: ${item.id}`);
    ids.add(item.id);
  }
});

test('ninguna inventa precios ni plazos concretos', () => {
  for (const item of QUICK_REPLIES) assert.ok(!/\$\s?\d|USD\s?\d|\d+\s?(días|horas) de entrega/i.test(item.text), item.title);
});

test('fillReply completa nombre y remitente; searchReplies filtra', () => {
  assert.equal(fillReply('Hola {nombre}, soy {yo}', { nombre: 'Ana', yo: 'Felipe' }), 'Hola Ana, soy Felipe');
  assert.equal(fillReply('Hola {nombre}', {}), 'Hola hola');
  assert.ok(searchReplies('proveedor').length >= 2);
  assert.ok(searchReplies('', 'derivar').every((item) => item.group === 'derivar'));
});
