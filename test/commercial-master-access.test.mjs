import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCommercialMaster } from '../api/commercial-master.js';

test('only General-channel emails can access the shared commercial master', () => {
  assert.equal(canAccessCommercialMaster('felipe@grupopoliplast.com.ar'), true);
  assert.equal(canAccessCommercialMaster('felipecnokaert@gmail.com'), true);
});

test('Penosil and Juan cannot access General\'s commercial master by accident', () => {
  assert.equal(canAccessCommercialMaster('info@grupopoliplast.com.ar'), false);
  assert.equal(canAccessCommercialMaster('juan@grupopoliplast.com.ar'), false);
});

test('unknown emails have no channels, so they cannot reach General\'s commercial master', () => {
  assert.equal(canAccessCommercialMaster('nadie@grupopoliplast.com.ar'), false);
});
