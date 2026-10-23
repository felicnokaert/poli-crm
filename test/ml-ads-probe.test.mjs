import test from 'node:test';
import assert from 'node:assert/strict';
import { probeAds } from '../lib/ml-ads-probe.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const reply = (status, json) => ({ ok: status < 300, status, text: async () => JSON.stringify(json) });

test('prueba de Publicidad: anunciante y campañas, sin guardar nada', async () => {
  const seen = [];
  const http = async (url, init) => {
    seen.push([url, init.headers['Api-Version']]);
    if (url.includes('/advertising/advertisers')) return reply(200, { advertisers: [{ advertiser_id: 777 }] });
    return reply(200, { results: [{ id: 1 }, { id: 2 }] });
  };
  const out = await probeAds([{ seller_id: '1', nickname: 'POLIPLAST' }], { http, tokenFor: async () => 't', now });
  assert.equal(out.length, 2);
  assert.match(out[0].detail, /1 anunciante/);
  assert.match(out[1].detail, /2 campaña/);
  assert.ok(seen[1][0].includes('/advertisers/777/product_ads/campaigns/search?date_from=2026-09-25&date_to=2026-10-24'));
});

test('sin permiso de Publicidad muestra el motivo y no sigue', async () => {
  const http = async () => reply(403, { message: 'forbidden' });
  const out = await probeAds([{ seller_id: '1', nickname: 'COMARG' }, { seller_id: '2', nickname: 'X' }], { http, tokenFor: async (account) => { if (account.seller_id === '2') throw new Error('token vencido'); return 't'; }, now });
  assert.equal(out[0].ok, false);
  assert.equal(out[0].status, 403);
  assert.equal(out.length, 2); // la 1ra corta en el anunciante; la 2da falla el token
  assert.match(out[1].detail, /token vencido/);
});
