import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionGaps, faqText } from '../src/ml-faq.mjs';

const q = (id, question, answer) => ({ id, item_id: 'A', question, answer });
const questions = [
  q('1', 'cuanto rinde?', 'Cada envase rinde 2m2 en un espesor de 2cm.'),
  q('2', 'cuantos m2 cubre?', 'Cada envase rinde 2m2 en un espesor de 2cm.'),
  q('3', 'que rendimiento tiene?', 'Cada envase rinde 2m2 en un espesor de 2cm.'),
  q('4', 'viene con pistola?', 'No, te dejamos el link de la pistola https://x'),
];

test('sugiere sumar a la descripción lo que se repite y falta', () => {
  const items = [{ id: 'A', status: 'active', title: 'Easyspray', description: 'Espuma de poliuretano en aerosol.' }];
  const [gap] = descriptionGaps(items, questions);
  assert.equal(gap.missing[0].key, 'rendimiento');
  assert.equal(gap.missing[0].asked, 3);
  assert.match(faqText(gap), /PREGUNTAS FRECUENTES\n• Rendimiento: Cada envase rinde 2m2/);
  assert.deepEqual(descriptionGaps([{ ...items[0], description: 'Rinde 2 m2 por envase.' }], questions), []);
  assert.deepEqual(descriptionGaps([{ ...items[0], status: 'paused' }], questions), []);
});
