import assert from 'node:assert/strict';
import test from 'node:test';
import { channelsForEmail } from '../src/user-channels.mjs';

test('channelsForEmail devuelve los canales asignados a cada cuenta conocida', () => {
  assert.deepEqual(channelsForEmail('felipe@grupopoliplast.com.ar'), ['general']);
  assert.deepEqual(channelsForEmail('juan@grupopoliplast.com.ar'), ['juan']);
  assert.deepEqual(channelsForEmail('info@grupopoliplast.com.ar'), ['penosil']);
});

test('channelsForEmail ignora mayúsculas y espacios al buscar la cuenta', () => {
  assert.deepEqual(channelsForEmail('  Juan@GrupoPoliplast.com.ar  '), ['juan']);
});

test('channelsForEmail cae a "general" para un email sin asignación explícita', () => {
  assert.deepEqual(channelsForEmail('alguien-nuevo@grupopoliplast.com.ar'), ['general']);
});

test('channelsForEmail cae a "general" para valores vacíos o inválidos', () => {
  assert.deepEqual(channelsForEmail(''), ['general']);
  assert.deepEqual(channelsForEmail(undefined), ['general']);
  assert.deepEqual(channelsForEmail(null), ['general']);
});
