import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingFromShopify, filterMissing, shopifyImportCsv, missingReviewCsv, cleanDescription, skuStem, metafieldsFrom } from '../src/shopify-missing.mjs';

const ml = (id, sku, title, over = {}) => ({ id, sku, title, status: 'active', price: 10000, sold_quantity: 5, visits_30d: 10, pictures_count: 5, available_quantity: 20, description: 'Producto de buena calidad. Más info en https://x.com o al +54 9 11 5555-5555.', attributes: [{ name: 'Marca', value: 'Poxiplast' }, { name: 'Motivo de GTIN vacío', value: 'Otra' }], permalink: `https://ml/${id}`, ...over });
const shop = { products: [{ id: 'p1', title: 'Balde plástico 10 L', status: 'ACTIVE' }, { id: 'p2', title: 'Viejo', status: 'ARCHIVED' }], variants: [{ id: 'v1', product_id: 'p1', sku: 'BL-10-1' }, { id: 'v2', product_id: 'p2', sku: 'OLD-1' }] };

test('skuStem y limpieza de descripción', () => {
  assert.equal(skuStem('RE-608-750'), 'RE-608');
  assert.equal(skuStem('PM595'), '');
  assert.equal(cleanDescription('Hola https://a.com/x chau +54 9 11 5555-5555 a@b.com'), 'Hola chau');
  assert.deepEqual(metafieldsFrom([{ name: 'Marca', value: 'X' }, { name: 'GTIN', value: '1' }]).map((f) => f.key), ['marca']);
});

test('detecta lo que está en ML y no en Shopify, ignora archivados y sin SKU', () => {
  const mlItems = [
    ml('A', 'BL-10-1', 'Balde 10 L'), // ya está
    ml('B', 'RE-608-750', 'Resina epoxi cristal 750 gr vidrio liquido', { sold_quantity: 1000 }),
    ml('C', 'RE-608-1500', 'Resina epoxi cristal 1500 gr vidrio liquido', { sold_quantity: 300 }),
    ml('D', 'OLD-1', 'Producto viejo'), // archivado en Shopify: si no está activo, falta
    ml('E', '', 'Sin sku nada', { sold_quantity: 9 }),
    ml('F', 'ZZ-1-1', 'Pausada', { status: 'paused' }),
  ];
  const out = missingFromShopify({ ...shop, mlItems });
  assert.deepEqual(out.rows.map((row) => row.sku), ['RE-608-750', 'RE-608-1500', 'OLD-1']);
  assert.equal(out.summary.missing, 3);
  assert.equal(out.summary.noSku, 1);
  const [first] = out.rows;
  assert.equal(first.price, 9000); // ML − 10 %
  assert.ok(!first.description.includes('http'));
  assert.deepEqual(first.tags, ['Poxiplast', 'crm-borrador']);
  assert.equal(first.group.size, 2);
  assert.deepEqual(first.group.options, ['Peso']);
});

test('si la familia de SKU ya existe en Shopify, se propone sumarla como variante; SKU casi igual y títulos parecidos avisan', () => {
  const out = missingFromShopify({
    ...shop,
    mlItems: [ml('A', 'BL-10-2', 'Balde plastico 10 L'), ml('B', 'bl.10.1', 'Otro'), ml('C', 'XX-1-1', 'Balde plástico 10 L reforzado')],
  });
  const bySku = Object.fromEntries(out.rows.map((row) => [row.sku, row]));
  assert.equal(bySku['BL-10-2'].joinsProduct.id, 'p1');
  assert.ok(bySku['BL.10.1'].twin);
  assert.ok(bySku['XX-1-1'].lookalike);
  assert.equal(filterMissing(out.rows, { view: 'sumar' }).length, 1);
  assert.equal(filterMissing(out.rows, { view: 'dudosos' }).length, 2);
});

test('CSV de importación: borrador, agrupado en un producto con variantes y sin duplicados', () => {
  const out = missingFromShopify({ ...shop, mlItems: [ml('B', 'RE-608-750', 'Resina epoxi cristal 750 gr vidrio liquido'), ml('C', 'RE-608-1500', 'Resina epoxi cristal 1500 gr vidrio liquido'), ml('D', 'BL-10-2', 'Balde 10 L')] });
  const csv = shopifyImportCsv(out.rows);
  const lines = csv.split('\n');
  assert.equal(lines.length, 1 + 2); // la cabecera + 2 variantes (el balde se suma a un producto existente y no entra)
  assert.match(lines[1], /"draft"/);
  assert.match(lines[1], /"Peso"/);
  assert.match(missingReviewCsv(out.rows), /RE-608-750/);
});

test('borradores: un producto por familia con título sin tamaño y opciones; el resto suelto', async () => {
  const { draftSpecs, groupTitle } = await import('../src/shopify-missing.mjs');
  const out = missingFromShopify({ ...shop, mlItems: [ml('B', 'RE-608-750', 'Resina epoxi cristal 750 gr vidrio liquido', { sold_quantity: 9 }), ml('C', 'RE-608-1500', 'Resina epoxi cristal 1500 gr vidrio liquido'), ml('D', 'ZZ-9', 'Pigmento rojo', { available_quantity: 0 })] });
  const specs = draftSpecs(out.rows);
  assert.equal(specs.length, 2);
  const resina = specs.find((spec) => spec.options.length);
  assert.equal(resina.title, 'Resina epoxi cristal vidrio liquido');
  assert.deepEqual(resina.options, [{ name: 'Peso', values: ['750 g', '1500 g'] }]);
  assert.equal(resina.variants.length, 2);
  assert.equal(resina.variants[0].stock, true);
  const suelto = specs.find((spec) => !spec.options.length);
  assert.equal(suelto.variants[0].stock, false);
  assert.equal(groupTitle({ mlTitle: 'Balde 10 L x5' }), 'Balde');
});

test('dos SKU del mismo producto y tamaño: se crea una sola variante y se avisa', async () => {
  const { draftSpecs } = await import('../src/shopify-missing.mjs');
  const out = missingFromShopify({ ...shop, mlItems: [ml('A', 'RE-608-0.750', 'Resina epoxi cristal 750gr vidrio', { sold_quantity: 90 }), ml('B', 'RE-608-750', 'Resina epoxi cristal 750gr vidrio', { sold_quantity: 10 }), ml('C', 'RE-608-1500', 'Resina epoxi cristal 1500gr vidrio')] });
  const specs = draftSpecs(out.rows);
  assert.equal(specs.length, 1);
  assert.deepEqual(specs[0].variants.map((variant) => variant.sku), ['RE-608-0.750', 'RE-608-1500']);
  assert.match(out.rows.find((row) => row.sku === 'RE-608-750').warnings.join(' '), /otro SKU/);
});

test('datos reales: saltos \\r\\n se normalizan y se arman párrafos', async () => {
  const { descriptionHtml } = await import('../src/shopify-missing.mjs');
  assert.equal(cleanDescription('Uno.\r\n\r\nDos.\r\n- a'), 'Uno.\n\nDos.\n- a');
  assert.equal(descriptionHtml(cleanDescription('Uno.\r\n\r\nDos.\r\n- a')), '<p>Uno.</p><p>Dos.<br>- a</p>');
});

test('datos reales: packs distintos no se toman por el mismo SKU, y el color no es metacampo de un producto con variantes', async () => {
  const { skuSuffixEquivalent, draftSpecs } = await import('../src/shopify-missing.mjs');
  const { skuCleanup } = await import('../src/ml-sku-cleanup.mjs');
  assert.equal(skuSuffixEquivalent('RE-608-0.750', 'RE-608-750'), true);
  assert.equal(skuSuffixEquivalent('BLBL-20-1', 'BLBL-20-3'), false);
  assert.equal(skuSuffixEquivalent('PS-PU47P-12', 'PS-PU47P-1'), false);
  const out = skuCleanup([{ id: 'a', sku: 'BLBL-20-1', title: 'Balde Plastico 20 Litros Con Tapa', status: 'active', sold_quantity: 5 }, { id: 'b', sku: 'BLBL-20-3', title: 'Balde Plastico 20 Litros Con Tapa', status: 'active', sold_quantity: 4 }]);
  assert.equal(out.similar.length, 0);
  const specs = draftSpecs(missingFromShopify({ ...shop, mlItems: [ml('A', 'TIM-W-1-NG', 'Timbre wifi negro', { attributes: [{ name: 'Color', value: 'Negro' }, { name: 'Color principal', value: 'Negro' }, { name: 'Marca', value: 'Kement' }] }), ml('B', 'TIM-W-1-BL', 'Timbre wifi blanco')] }).rows);
  assert.equal(specs.length, 1);
  assert.deepEqual(specs[0].metafields.map((field) => field.key), ['marca']);
});
