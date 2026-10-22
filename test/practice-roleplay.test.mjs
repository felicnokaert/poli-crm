import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPracticeMessages, PRACTICE_PROMPT } from '../lib/assistant-ai.mjs';
import { OBJECTIONS, PLAYBOOKS } from '../src/commercial-knowledge.mjs';

test('práctica: la IA hace de cliente y la charla arranca por el vendedor', () => {
  assert.match(PRACTICE_PROMPT, /CLIENTE/);
  assert.match(PRACTICE_PROMPT, /EVALUAR/);
  const messages = buildPracticeMessages({ question: 'Entiendo, ¿con qué lo estás comparando?', history: [{ role: 'user', text: '(empezá)' }, { role: 'assistant', text: 'Está caro.' }] });
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(messages.at(-1).content, 'Entiendo, ¿con qué lo estás comparando?');
  assert.ok(PLAYBOOKS.length && OBJECTIONS.length);
});
