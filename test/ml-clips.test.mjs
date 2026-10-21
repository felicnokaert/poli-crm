import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipIdsFrom } from '../src/ml-clips.mjs';

test('clips: toma links, códigos y títulos exactos', () => {
  const items = [{ id: 'MLA111111', title: 'Espuma Penosil EasySpray' }, { id: 'MLA222222', title: 'Resina Epoxi 750gr' }];
  const text = 'https://articulo.mercadolibre.com.ar/MLA-3218666158-penosil _JM\nMLA999999\nespuma penosil easyspray\notra cosa';
  const { ids, titles } = clipIdsFrom(text, items);
  assert.deepEqual(ids.sort(), ['MLA111111', 'MLA3218666158', 'MLA999999']);
  assert.equal(titles, 1);
});
