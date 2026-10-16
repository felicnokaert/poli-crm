import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, nextTheme, readTheme } from '../src/theme.mjs';

test('el tema rota automático, claro, oscuro', () => {
  assert.equal(nextTheme('auto'), 'claro');
  assert.equal(nextTheme('claro'), 'oscuro');
  assert.equal(nextTheme('oscuro'), 'auto');
  assert.equal(nextTheme('raro'), 'auto');
});

test('applyTheme marca el documento y guarda la elección', () => {
  const root = { dataset: {} };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  applyTheme('oscuro', root, storage);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(readTheme(storage), 'oscuro');
  applyTheme('claro', root, storage);
  assert.equal(root.dataset.theme, 'light');
  applyTheme('auto', root, storage);
  assert.equal(root.dataset.theme, undefined);
  assert.equal(readTheme({ getItem: () => 'x' }), 'auto');
});

test('el CSS oscuro está acotado: ninguna regla se aplica en modo claro', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/theme-dark.css', import.meta.url), 'utf8');
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  for (const m of body.matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
    for (const sel of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!sel.startsWith(':root')) bad.push(sel);
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
