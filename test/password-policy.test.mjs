import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PASSWORD, authErrorEs, passwordProblem } from '../src/password-policy.mjs';

test('contraseña: mínimo 8 y que coincidan', () => {
  assert.equal(MIN_PASSWORD, 8);
  assert.match(passwordProblem('1234567'), /al menos 8/);
  assert.match(passwordProblem('12345678', 'otra'), /no coinciden/);
  assert.equal(passwordProblem('12345678', '12345678'), '');
});

test('errores de Supabase en castellano', () => {
  assert.equal(authErrorEs({ message: 'Invalid login credentials' }), 'Correo o contraseña incorrectos.');
  assert.match(authErrorEs({ code: 'weak_password', message: 'Password is known to be weak' }), /muy débil/);
  assert.match(authErrorEs({ message: 'Password should be at least 8 characters.' }), /muy débil/);
  assert.match(authErrorEs({ code: 'same_password', message: 'New password should be different from the old password.' }), /distinta/);
  assert.equal(authErrorEs({ message: 'Otra cosa' }), 'Otra cosa');
});
