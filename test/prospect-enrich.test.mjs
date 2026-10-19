import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHost, enrichWebsite, extractContacts, isPrivateAddress, normalizeSiteUrl, robotsAllows } from '../lib/prospect-enrich.mjs';
import { applyEnrichment } from '../src/prospect-enrich-apply.mjs';

const publicLookup = async () => [{ address: '93.184.216.34' }];

const HTML = `<html><body>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">compartir</a>
<a href="https://www.facebook.com/FerreteriaNorte?ref=x">fb</a>
<a href="https://instagram.com/p/ABC123/">post</a>
<a href="https://www.instagram.com/ferreteria.norte/">ig</a>
<a href="https://wa.me/5491155551234?text=hola">wa</a>
<a href="mailto:Ventas@ferreteria.com.ar?subject=hola">mail</a>
<img src="logo@2x.png"> contacto: info@ferreteria.com.ar
</body></html>`;

test('extrae redes, WhatsApp y mail ignorando enlaces de compartir y posts', () => {
  const out = extractContacts(HTML, 'https://www.ferreteria.com.ar/');
  assert.equal(out.facebook, 'https://www.facebook.com/FerreteriaNorte');
  assert.equal(out.instagram, 'https://www.instagram.com/ferreteria.norte');
  assert.deepEqual(out.whatsapp, { number: '5491155551234', link: 'https://wa.me/5491155551234', possible: true });
  assert.deepEqual(out.emails, ['ventas@ferreteria.com.ar', 'info@ferreteria.com.ar']);
});

test('un WhatsApp que no es celular argentino +54 9 no genera link', () => {
  const out = extractContacts('<a href="https://wa.me/541143211234">x</a>', 'https://x.com');
  assert.equal(out.whatsapp.number, '541143211234');
  assert.equal(out.whatsapp.link, '');
});

test('robots.txt: respeta Disallow, Allow más específico y el agente propio', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /privado', '/contacto'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /contacto', '/contacto'), true);
  assert.equal(robotsAllows('User-agent: PoliplastCRM-Prospeccion\nDisallow: /\n\nUser-agent: *\nAllow: /', '/'), false);
  assert.equal(robotsAllows('', '/'), true);
});

test('rechaza redes privadas y direcciones raras', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', '::ffff:10.0.0.1', 'fd00::1']) assert.ok(isPrivateAddress(ip), ip);
  assert.ok(!isPrivateAddress('93.184.216.34'));
  await assert.rejects(assertPublicHost(new URL('http://localhost/'), publicLookup));
  await assert.rejects(assertPublicHost(new URL('http://interno.example/'), async () => [{ address: '10.1.1.1' }]));
  assert.equal(normalizeSiteUrl('ftp://x.com'), null);
  assert.equal(normalizeSiteUrl('http://user:pass@x.com'), null);
  assert.equal(normalizeSiteUrl('http://x.com:8080'), null);
  assert.equal(normalizeSiteUrl('ferreteria.com.ar').href, 'https://ferreteria.com.ar/');
});

function fakeFetch(routes, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const route = routes[url];
    if (!route) return new Response('no', { status: 404 });
    if (route.redirect) return new Response(null, { status: 302, headers: { location: route.redirect } });
    return new Response(route.body, { status: 200, headers: { 'content-type': route.type || 'text/html' } });
  };
}

test('enriquece desde la portada, se identifica y consulta robots.txt primero', async () => {
  const calls = [];
  const fetchFn = fakeFetch({ 'https://ferreteria.com.ar/robots.txt': { body: 'User-agent: *\nDisallow: /admin', type: 'text/plain' }, 'https://ferreteria.com.ar/': { body: HTML } }, calls);
  const out = await enrichWebsite('ferreteria.com.ar', { fetchFn, lookup: publicLookup });
  assert.equal(out.ok, true);
  assert.equal(out.instagram, 'https://www.instagram.com/ferreteria.norte');
  assert.match(calls[0].url, /robots\.txt$/);
  assert.ok(calls.every((call) => /PoliplastCRM-Prospeccion/.test(call.options.headers['User-Agent'])));
});

test('si robots.txt lo prohíbe no se lee el sitio', async () => {
  const calls = [];
  const fetchFn = fakeFetch({ 'https://x.com.ar/robots.txt': { body: 'User-agent: *\nDisallow: /', type: 'text/plain' }, 'https://x.com.ar/': { body: HTML } }, calls);
  const out = await enrichWebsite('https://x.com.ar', { fetchFn, lookup: publicLookup });
  assert.equal(out.blockedByRobots, true);
  assert.equal(out.instagram, '');
  assert.ok(!calls.some((call) => call.url === 'https://x.com.ar/'));
});

test('una redirección a una red privada se corta', async () => {
  const lookup = async (host) => [{ address: host === 'trampa.internal.test' ? '10.0.0.9' : '93.184.216.34' }];
  const fetchFn = fakeFetch({ 'https://x.com.ar/': { redirect: 'https://trampa.internal.test/' } });
  const out = await enrichWebsite('https://x.com.ar', { fetchFn, lookup });
  assert.equal(out.ok, false);
  assert.match(out.error, /no permitida/);
});

test('rechaza redes sociales como sitio y errores del sitio dan mensaje claro', async () => {
  assert.equal((await enrichWebsite('https://instagram.com/x', { lookup: publicLookup })).ok, false);
  const out = await enrichWebsite('https://caido.com.ar', { fetchFn: fakeFetch({}), lookup: publicLookup });
  assert.equal(out.ok, false);
  assert.match(out.error, /404/);
});

test('aplicar completa solo campos vacíos y deja el WhatsApp como posible en notas', () => {
  const prospect = { id: 'p1', email: 'propio@x.com', facebook: '', instagram: '', phone: '', notes: 'Nota previa' };
  const result = { ok: true, facebook: 'https://www.facebook.com/a', instagram: 'https://www.instagram.com/a', emails: ['otro@x.com'], whatsapp: { number: '5491155551234', link: 'https://wa.me/5491155551234', possible: true } };
  const { prospect: next, added } = applyEnrichment(prospect, result, '2026-10-14T00:00:00Z');
  assert.equal(next.email, 'propio@x.com');
  assert.equal(next.facebook, 'https://www.facebook.com/a');
  assert.match(next.notes, /Nota previa\nWhatsApp del sitio \(posible\): https:\/\/wa.me\/5491155551234/);
  assert.equal(next.phone, '+5491155551234');
  assert.ok(added.includes('Instagram') && !added.includes('email'));
  assert.equal(applyEnrichment(prospect, { ok: true, blockedByRobots: true }).added.length, 0);
});

test('extractContacts descarta los mails de ejemplo de los formularios', () => {
  const out = extractContacts('<p>contacto@kilcom.com.ar</p><input placeholder="nombre@empresa.com"><span>tu@email.com</span><span>tulio@gmail.com</span>', 'https://kilcom.com.ar/');
  assert.deepEqual(out.emails, ['contacto@kilcom.com.ar', 'tulio@gmail.com']);
});
