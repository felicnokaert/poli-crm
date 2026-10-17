import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompetitorFromPages, researchCompetitor } from '../lib/competitor-research.mjs';

const HOME = `<html><head><title>Aislar SRL | Poliuretano proyectado</title>
<meta name="description" content="Fabricamos sistemas de poliuretano y hacemos aislación térmica con poliuretano proyectado.">
<script type="application/ld+json">{"address":{"streetAddress":"Ruta 9 km 300","addressLocality":"Rosario"}}</script></head>
<body><a href="/productos">Productos</a><a href="tel:+54 341 555-1234">Llamanos</a><a href="mailto:ventas@aislar.com.ar">Mail</a>
<a href="https://www.instagram.com/aislar.srl/">IG</a><p>Poliuretano proyectado, aislación térmica, impermeabilización de techos. Aplicador.</p></body></html>`;
const PRODUCTOS = `<html><head><title>Productos</title></head><body><h2>Espuma de poliuretano</h2><h2>Poliurea</h2><p>Máquinas y repuestos.</p></body></html>`;

test('arma la ficha solo con lo que dice el sitio, con fuentes', () => {
  const c = buildCompetitorFromPages({ name: 'Aislar SRL', website: 'https://aislar.com.ar', pages: [{ url: 'https://aislar.com.ar/', html: HOME }, { url: 'https://aislar.com.ar/productos', html: PRODUCTOS }], now: new Date('2026-10-17T15:00:00Z') });
  assert.match(c.summary, /Según su sitio: "Fabricamos sistemas de poliuretano/);
  assert.ok(c.products.includes('Poliuretano proyectado'));
  assert.ok(c.products.includes('Poliurea'));
  assert.ok(c.families.includes('PURMAC'));
  assert.equal(c.location, 'Ruta 9 km 300, Rosario');
  assert.match(c.channels, /Tel\. \+543415551234/);
  assert.match(c.channels, /ventas@aislar\.com\.ar/);
  assert.equal(c.kind, 'fabricante');
  assert.deepEqual(c.sources.map((s) => s.u), ['https://aislar.com.ar/', 'https://aislar.com.ar/productos', 'https://www.instagram.com/aislar.srl']);
  assert.match(c.caveats, /17\/10\/2026 \(2 páginas\)\. Falta revisarla\./);
});

test('si el sitio dice poco, lo avisa en vez de inventar', () => {
  const c = buildCompetitorFromPages({ name: 'Vacía', website: 'https://vacia.com', pages: [{ url: 'https://vacia.com/', html: '<html><body>Hola</body></html>' }] });
  assert.equal(c.summary, '');
  assert.deepEqual(c.products, []);
  assert.equal(c.location, '');
  assert.match(c.caveats, /El sitio no dice: descripción, productos, dirección, contacto\./);
});

function fakeWeb(pages) {
  return {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchFn: async (url) => {
      const body = pages[url];
      if (body === undefined) return { ok: false, status: 404, headers: { get: () => '' } };
      return { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/html' : '') }, body: null, text: async () => body,
        arrayBuffer: async () => new TextEncoder().encode(body).buffer };
    },
  };
}

test('researchCompetitor lee portada y páginas internas; respeta robots.txt; rechaza redes', async () => {
  const web = fakeWeb({ 'https://aislar.com.ar/': HOME, 'https://aislar.com.ar/productos': PRODUCTOS });
  const ok = await researchCompetitor({ name: 'Aislar SRL', website: 'aislar.com.ar' }, web);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.competitor.name, 'Aislar SRL');
  assert.equal(ok.competitor.sources.length, 3);
  const blocked = await researchCompetitor({ name: 'X', website: 'aislar.com.ar' }, fakeWeb({ 'https://aislar.com.ar/robots.txt': 'User-agent: *\nDisallow: /', 'https://aislar.com.ar/': HOME }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'robots');
  const social = await researchCompetitor({ name: '', website: 'https://instagram.com/foo' }, fakeWeb({}));
  assert.equal(social.ok, false);
  assert.equal(social.reason, 'sin-sitio');
});
