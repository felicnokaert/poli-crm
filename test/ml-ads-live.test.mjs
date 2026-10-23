import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignRow, refreshAds, summarizeCampaigns } from '../lib/ml-ads.mjs';
import { tacosFor } from '../src/ml-tacos.mjs';

test('campaignRow lee métricas sueltas o dentro de metrics', () => {
  assert.equal(campaignRow({ id: 1, name: 'A', metrics: { cost: 100, total_amount: 500 } }).acos, 0.2);
  const loose = campaignRow({ id: 2, cost: 50, direct_amount: 100, indirect_amount: 150 });
  assert.equal(loose.revenue, 250);
  assert.equal(campaignRow({ id: 3 }).acos, null);
});

test('summarizeCampaigns suma la inversión y ordena por gasto', () => {
  const s = summarizeCampaigns([{ id: 1, metrics: { cost: 10 } }, { id: 2, metrics: { cost: 30, total_amount: 90 } }]);
  assert.equal(s.spend, 40);
  assert.equal(s.campaigns[0].id, '2');
  assert.equal(s.count, 2);
});

test('refreshAds guarda una foto por cuenta y no corta si una falla', async () => {
  const saved = [];
  const http = async (url) => {
    if (url.includes('/advertisers?')) return new Response(JSON.stringify({ advertisers: [{ advertiser_id: 7 }] }), { status: 200 });
    return new Response(JSON.stringify({ results: [{ id: 1, name: 'X', metrics: { cost: 1200, total_amount: 9000 } }] }), { status: 200 });
  };
  const out = await refreshAds(
    [{ seller_id: 1, nickname: 'A' }, { seller_id: 2, nickname: 'B' }],
    { http, store: { upsert: async (table, rows) => saved.push(...rows) }, tokenFor: async (account) => { if (account.seller_id === 2) throw new Error('token vencido'); return 't'; } },
  );
  assert.equal(out[0].ok, true);
  assert.equal(out[0].spend, 1200);
  assert.equal(out[1].ok, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].key, 'ml-ads:1');
});

test('tacosFor usa la lectura en vivo antes que la tabla pegada y avisa si es vieja', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const live = { spend: 1700, fetchedAt: '2026-10-25T08:00:00Z' };
  const fresh = tacosFor({ sales30: 10000, live, report: { savedAt: '2026-10-01T00:00:00Z', summary: { spend: 1 } }, now });
  assert.equal(fresh.state, 'en-vivo');
  assert.equal(fresh.tacos, 0.17);
  const old = tacosFor({ sales30: 10000, live: { spend: 1700, fetchedAt: '2026-10-20T08:00:00Z' }, now });
  assert.equal(old.state, 'en-vivo-viejo');
  assert.equal(tacosFor({ sales30: 0, live, now }).state, 'sin-ventas');
  assert.equal(tacosFor({ sales30: 100, now }).state, 'sin-datos');
});
