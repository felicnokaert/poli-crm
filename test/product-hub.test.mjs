import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductHub, filterHub, findInHub, productHubContext, trendFor, asksProductHub } from '../src/product-hub.mjs';

const base = () => ({
  dollar: 1500,
  variants: [{ id: 'v1', sku: 'RE-608-1', name: 'Resina epoxi 1 kg', product_id: 'p1' }, { id: 'v2', sku: 'RE-608-0.450', name: 'Resina epoxi 450 g', product_id: 'p2' }],
  listPrices: { 'RE-608-1': { gross: 30, currency: 'USD' }, 'RE-608-0.450': { gross: 468.91, currency: 'USD' } },
  photos: { p1: 'https://x/foto.webp' },
  nickname: { 1: 'POLIPLAST SRL', 2: 'FOAMFACTORY' },
  items: [
    { id: 'MLA1', seller_id: 1, status: 'active', title: 'Resina Epoxi Cristal 1 Kg', price: 50000, listing_type: 'gold_special', sku: 'RE-608-1', category_id: 'C1', visits_7d: 60, visits_30d: 100, sold_quantity: 900, available_quantity: 10 },
    { id: 'MLA2', seller_id: 2, status: 'active', title: 'Resina Epoxi Cristal 1 Kg Cuotas', price: 56000, listing_type: 'gold_pro', sku: '', variation_skus: [{ id: 9, sku: 'RE-608-1' }], category_id: 'C1', visits_7d: 5, visits_30d: 50 },
    { id: 'MLA3', seller_id: 1, status: 'active', title: 'Resina 450 g', price: 27000, listing_type: 'gold_special', sku: 'RE-608-0.450' },
    { id: 'MLA4', seller_id: 1, status: 'paused', title: 'Pausada', price: 1, sku: 'RE-608-1' },
    { id: 'MLA5', seller_id: 1, status: 'active', title: 'Timbre wifi', price: 40000, listing_type: 'gold_pro', sku: 'TIM-W-MINI-NG' },
  ],
  economics: {
    MLA1: { units_30d: 20, revenue_30d: 1000000, fees_30d: 130000, shipping_per_unit: 5000 },
    MLA2: { units_30d: 5, revenue_30d: 280000, fees_30d: 56000, shipping_per_unit: 5000 },
  },
  health: { MLA1: { quality_level: 'Básica', px_color: 'green' } },
  catalog: { MLA2: { status: 'competing', winner_is_ours: false, price_to_win: 54000, winner_nickname: 'OTRO' } },
  shopify: [{ sku: 're-608-1', price: 60000, status: 'ACTIVE', title: 'Resina 1 kg' }],
  trends: { C1: [{ keyword: 'resina epoxi cristal', rank: 1 }] },
});

test('junta por SKU cotizador, publicaciones activas (también por SKU de variación) y Shopify', () => {
  const rows = buildProductHub(base());
  const resina = rows.find((row) => row.sku === 'RE-608-1');
  assert.equal(resina.ml.length, 2, 'solo activas; la pausada no cuenta');
  assert.equal(resina.list.ars, 45000);
  assert.equal(resina.units30, 25);
  assert.equal(resina.shopify.length, 1);
  assert.equal(rows[0].sku, 'RE-608-1', 'ordena por ventas de 30 días');
});

test('lo que queda por unidad usa la comisión real y el envío medido, y compara Clásica con Premium', () => {
  const resina = buildProductHub(base()).find((row) => row.sku === 'RE-608-1');
  const classic = resina.channels.find((channel) => channel.key === 'ml-gold_special');
  const premium = resina.channels.find((channel) => channel.key === 'ml-gold_pro');
  assert.equal(classic.net, 50000 - 6500 - 5000);
  assert.equal(premium.net, 56000 - 11200 - 5000);
  assert.equal(resina.best.key, 'shopify');
  assert.ok(resina.advice.some((line) => /Clásica deja \$ 700 más/.test(line)) || resina.advice.some((line) => /Premium/.test(line)));
  assert.ok(resina.advice.some((line) => /tendencia/.test(line)));
  assert.ok(resina.advice.some((line) => /Visitas en alza/.test(line)));
});

test('avisos: precio raro, catálogo perdido, calidad básica, Shopify más caro, no está en el cotizador', () => {
  const rows = buildProductHub(base());
  const chica = rows.find((row) => row.sku === 'RE-608-0.450');
  assert.ok(chica.alerts.some((alert) => alert.key === 'precio-raro' && alert.text.startsWith('⚠ Precio raro')));
  const resina = rows.find((row) => row.sku === 'RE-608-1');
  const keys = resina.alerts.map((alert) => alert.key);
  assert.ok(keys.includes('catalogo') && keys.includes('calidad') && keys.includes('shopify-caro'));
  assert.ok(!keys.includes('precio-raro'));
  assert.ok(rows.find((row) => row.sku === 'TIM-W-MINI-NG').alerts.some((alert) => alert.key === 'no-cotizador'));
});

test('sin dólar no inventa el precio de lista en pesos ni marca precio raro', () => {
  const rows = buildProductHub({ ...base(), dollar: null });
  const chica = rows.find((row) => row.sku === 'RE-608-0.450');
  assert.equal(chica.list.ars, null);
  assert.ok(!chica.alerts.some((alert) => alert.key === 'precio-raro'));
});

test('sin ventas la comisión queda sin medir', () => {
  const timbre = buildProductHub(base()).find((row) => row.sku === 'TIM-W-MINI-NG');
  assert.equal(timbre.channels[0].net, null);
  assert.match(timbre.channels[0].note, /sin medir/);
});

test('filtros, búsqueda y contexto para el asistente', () => {
  const rows = buildProductHub(base());
  assert.deepEqual(filterHub(rows, { filter: 'precio-raro' }).map((row) => row.sku), ['RE-608-0.450']);
  assert.equal(filterHub(rows, { query: 'timbre' }).length, 1);
  assert.equal(filterHub(rows, { filter: 'tendencia' })[0].sku, 'RE-608-1');
  assert.equal(findInHub(rows, '¿dónde conviene vender el RE-608-1?')[0].sku, 'RE-608-1');
  assert.equal(findInHub(rows, 'conviene la resina epoxi en cuotas')[0].sku, 'RE-608-1');
  assert.ok(asksProductHub('¿conviene en cuotas?') && asksProductHub('ficha del RE-608-1') && !asksProductHub('hola'));
  const text = productHubContext(findInHub(rows, 'RE-608-1'));
  assert.match(text, /Mercado Libre Clásica/);
  assert.match(text, /queda \$\s38\.500/);
});

test('tendencia: necesita dos palabras del producto en el título', () => {
  assert.ok(trendFor('Resina Epoxi Cristal 1kg', [{ keyword: 'resina epoxi' }]));
  assert.equal(trendFor('Balde 20 litros', [{ keyword: 'resina epoxi' }]), null);
});

import { parseBnaHtml } from '../lib/bna-dollar.mjs';
test('dólar BNA: lee la venta de billetes y no la de divisas', () => {
  const html = `<div id="billetes"><table><thead><tr><th class="fechaCot">20/11/2026</th></tr></thead><tbody><tr><td class="tit">Dolar U.S.A</td><td>1480,00</td><td>1530,00</td></tr></tbody></table></div><div id="divisas"><table><tr><td class="tit">Dolar U.S.A</td><td>1499</td><td>1508</td></tr></table></div>`;
  assert.deepEqual(parseBnaHtml(html), { rate: 1530, quotationDate: '20/11/2026' });
  assert.equal(parseBnaHtml('<html></html>'), null);
});

test('con ⚠ precio raro la lista no cuenta como el canal que deja más', () => {
  const chica = buildProductHub(base()).find((row) => row.sku === 'RE-608-0.450');
  assert.ok(chica.rarePrice);
  assert.notEqual(chica.best?.key, 'directo');
  assert.ok(chica.advice.some((line) => /no cierra con Mercado Libre/.test(line)));
});
