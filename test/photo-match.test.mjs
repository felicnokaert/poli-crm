import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileBase, matchPhotos, photoState, selectedByDefault, skuKeys, summarize } from '../src/photo-match.mjs';

const products = [
  { id: 'p1', name: 'AIRLESS SPRAYER BLUE PURMAC 220 V 490', photo_path: '' },
  { id: 'p2', name: 'POLIURETANO EXPANDIDO ESPUMA KIT X 1 KG', photo_path: '' },
  { id: 'p3', name: 'SEMI MASCARA 3M 6200', photo_path: 'ya.png' },
  { id: 'p4', name: 'BALDE 10 LITROS AZUL', photo_path: '' },
  { id: 'p5', name: 'BALDE 10 LITROS ROJO', photo_path: '' },
];
const variants = [
  { product_id: 'p1', sku: 'PM490' }, { product_id: 'p2', sku: 'KT-740-1' }, { product_id: 'p2', sku: 'KT-740-10' },
  { product_id: 'p3', sku: '3M-6200/07025-1' }, { product_id: 'p4', sku: 'BLAZ-10-1' }, { product_id: 'p5', sku: 'BLRO-10-1' },
];
const photos = [{ product_id: 'p2', approved_by: 'claude - falta revisar' }, { product_id: 'p4', approved_by: 'marketing@grupopoliplast.com.ar' }];
const run = (...names) => matchPhotos(names.map((name) => ({ name })), { products, variants, photos });

test('el nombre del archivo sin extensión y sin ruta', () => {
  assert.equal(fileBase('fotos/pm/PM490.JPG'), 'PM490');
  assert.equal(fileBase('C:\\fotos\\KT-740-1.webp'), 'KT-740-1');
});

test('claves de SKU: primero el nombre entero, después sin sufijos típicos', () => {
  assert.deepEqual(skuKeys('PM490_foto.jpg'), ['PM490FOTO', 'PM490']);
  assert.deepEqual(skuKeys('PM490 (1).png'), ['PM4901', 'PM490']);
  assert.equal(skuKeys('KT-740-1.png')[0], 'KT7401');
});

test('empareja por SKU exacto, ignorando mayúsculas, guiones y barras', () => {
  const [a, b, c] = run('pm490.jpg', 'KT-740-1.png', '3M-6200_07025-1.jpg');
  assert.equal(a.product.id, 'p1'); assert.equal(a.status, 'exacto');
  assert.equal(b.product.id, 'p2');
  assert.equal(c.product.id, 'p3');
});

test('un SKU con sufijo de foto igual encuentra su producto; uno que existe entero no se recorta', () => {
  assert.equal(run('PM490_frente.jpg')[0].product.id, 'p1');
  assert.equal(run('KT-740-10.jpg')[0].product.id, 'p2');
  assert.equal(run('KT-740-10.jpg')[0].sku, 'KT-740-10');
});

test('por nombre: solo si hay un candidato claro; si hay empate queda ambiguo; sin nada, sin coincidencia', () => {
  const [probable, ambiguo, sin] = run('Balde 10 litros azul.jpg', 'balde 10 litros.jpg', 'foto cualquiera.jpg');
  assert.equal(probable.status, 'probable'); assert.equal(probable.product.id, 'p4');
  assert.equal(ambiguo.status, 'ambiguo'); assert.equal(ambiguo.product, null); assert.ok(ambiguo.candidates.length >= 2);
  assert.equal(sin.status, 'sin');
});

test('dos archivos para el mismo producto: el segundo queda como repetida', () => {
  const [first, second] = run('PM490.jpg', 'PM490_foto.jpg');
  assert.equal(first.status, 'exacto');
  assert.equal(second.status, 'repetida'); assert.equal(second.duplicateOf, 'PM490.jpg');
});

test('estado de la foto actual y qué se marca por defecto', () => {
  assert.equal(photoState(products[2], null), 'propia');
  assert.equal(photoState(products[1], photos[0]), 'sin-revisar');
  assert.equal(photoState(products[3], photos[1]), 'aprobada');
  assert.equal(photoState(products[0], undefined), null);
  const rows = run('PM490.jpg', 'KT-740-1.jpg', '3M-6200-07025-1.jpg', 'BLAZ-10-1.jpg');
  assert.deepEqual(rows.map(selectedByDefault), [true, true, false, false]);
});

test('resumen por estado', () => {
  const rows = run('PM490.jpg', 'Balde 10 litros azul.jpg', 'balde 10 litros.jpg', 'xx.jpg', 'PM490_foto.jpg');
  assert.deepEqual(summarize(rows), { total: 5, exacto: 1, probable: 1, ambiguo: 1, sin: 1, repetida: 1 });
});
