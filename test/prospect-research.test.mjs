import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAgainstFamily, parseDuckDuckGo, parseBing, usableCandidates, buildQueries, htmlToText, researchWebsite, discoverCandidates } from '../lib/prospect-research.mjs';

test('puntúa alto un sitio que habla de PRFV y motorhomes, con citas', () => {
  const r = scoreAgainstFamily({ family: 'Carrozados', texts: [{ url: 'https://x.com', text: 'Fabricamos motorhomes y casillas rodantes con laminado en fibra de vidrio (PRFV).' }] });
  assert.ok(r.score >= 60, `score ${r.score}`);
  assert.equal(r.label, 'Encaja bien');
  assert.ok(r.evidence[0].snippet.length > 10);
  assert.match(r.reasoning[0], /señales/);
});

test('un sitio sin señales da poca evidencia y lo explica', () => {
  const r = scoreAgainstFamily({ family: 'Penosil', texts: [{ url: 'https://x.com', text: 'Clínica odontológica, turnos online.' }] });
  assert.equal(r.label, 'Poca evidencia');
  assert.match(r.reasoning.join(' '), /No se encontró/);
});

test('detecta competidores mencionados', () => {
  const r = scoreAgainstFamily({ family: 'Poliuretano', texts: [{ url: 'u', text: 'Aplicamos poliuretano proyectado con material de Argenpur.' }] });
  assert.deepEqual(r.competitors, ['Argenpur']);
});

test('parsea resultados de DuckDuckGo y Bing y filtra redes y directorios', () => {
  const ddg = '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.aplicadoresur.com.ar%2F&rut=x">Aplicadores SUR</a><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fabc">FB</a>';
  const bing = '<li class="b_algo"><h2><a href="https://www.poliurex.com/">Poliurex</a></h2></li>';
  const all = [...parseDuckDuckGo(ddg), ...parseBing(bing)];
  assert.equal(all.length, 3);
  const usable = usableCandidates(all);
  assert.deepEqual(usable.map((item) => item.host), ['aplicadoresur.com.ar', 'poliurex.com']);
});

test('arma consultas por rubro y zona', () => {
  const q = buildQueries({ rubros: ['carrocería', 'motorhome'], city: 'Rosario', province: 'Santa Fe', family: 'Carrozados' });
  assert.ok(q.includes('carrocería Rosario Santa Fe'));
  assert.ok(q.length <= 4);
});

test('htmlToText saca scripts y etiquetas', () => {
  assert.equal(htmlToText('<script>x()</script><p>Hola <b>mundo</b></p>'), 'Hola mundo');
});

test('researchWebsite lee portada y página de productos con fetch simulado y respeta robots', async () => {
  const pages = {
    'https://sitio.com.ar/robots.txt': 'User-agent: *\nDisallow: /privado',
    'https://sitio.com.ar/': '<title>Sitio</title><a href="/productos">Productos</a><a href="mailto:ventas@sitio.com.ar">m</a><p>Carrocería</p>',
    'https://sitio.com.ar/productos': '<p>Acoplados y motorhomes en PRFV, fibra de vidrio laminada.</p>',
  };
  const fetchFn = async (url) => ({ ok: url in pages, status: url in pages ? 200 : 404, headers: { get: (k) => (k === 'content-type' ? 'text/html' : null) }, text: async () => pages[url] });
  const r = await researchWebsite({ website: 'sitio.com.ar', family: 'Carrozados' }, { fetchFn, lookup: async () => [{ address: '93.184.216.34' }] });
  assert.equal(r.ok, true);
  assert.ok(r.score >= 60);
  assert.equal(r.pages.length, 2);
  assert.deepEqual(r.contacts.emails, ['ventas@sitio.com.ar']);
});

test('discoverCandidates sigue con el segundo buscador si el primero falla', async () => {
  const fetchFn = async (url) => (url.includes('duckduckgo')
    ? { ok: false }
    : { ok: true, text: async () => '<li class="b_algo"><h2><a href="https://www.poliurex.com/">Poliurex</a></h2></li>' });
  const r = await discoverCandidates({ rubros: ['aplicador de poliuretano'], city: 'Rosario', province: 'Santa Fe', family: 'Poliuretano' }, { fetchFn });
  assert.equal(r.candidates[0].host, 'poliurex.com');
});

import { unwrapBing, parseMojeek } from '../lib/prospect-research.mjs';

test('desarma los enlaces de Bing que envuelven la dirección real', () => {
  const real = 'https://www.poliurex.com/';
  const b64 = Buffer.from(real).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(unwrapBing(`https://www.bing.com/ck/a?!&&p=abc&u=a1${b64}&ntb=1`), real);
  assert.equal(unwrapBing('https://otro.com/x'), 'https://otro.com/x');
  const html = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;u=a1${b64}&amp;ntb=1">Poliurex</a></h2></li>`;
  assert.equal(parseBing(html)[0].url, real);
});

test('parsea resultados de Mojeek', () => {
  const html = '<li><h2><a class="title" href="https://aplicadores.com.ar/">Aplicadores</a></h2></li><a href="https://x.com/" class="ob">X</a>';
  assert.deepEqual(parseMojeek(html).map((r) => r.url), ['https://aplicadores.com.ar/', 'https://x.com/']);
});

test('discoverCandidates informa qué respondió cada buscador', async () => {
  const fetchFn = async (url) => (url.includes('duckduckgo') ? { ok: false, status: 202 } : { ok: true, text: async () => '<li class="b_algo"><h2><a href="https://www.poliurex.com/">P</a></h2></li>' });
  const r = await discoverCandidates({ rubros: ['x'], city: 'Rosario', province: 'Santa Fe', family: 'Poliuretano' }, { fetchFn });
  assert.ok(r.engines.some((line) => /DuckDuckGo: HTTP 202/.test(line)));
  assert.equal(r.rawResults > 0, true);
});
