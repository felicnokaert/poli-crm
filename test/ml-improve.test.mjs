import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experienceFields, itemHealth, qualityFields } from '../lib/ml-health.mjs';
import { asksMlImprove, improveContext, improvePlan } from '../src/ml-improve.mjs';

const PERFORMANCE = {
  entity_type: 'ITEM', entity_id: 'MLA1', score: 55, level: 'Standard', level_wording: 'Estándar', calculated_at: '2026-10-20',
  buckets: [{ key: 'CHARACTERISTICS', status: 'PENDING', title: 'Características', variables: [{ key: 'PICTURES', status: 'PENDING', rules: [
    { key: 'ADD_PICTURES', status: 'PENDING', progress: 0.33, mode: 'OPPORTUNITY', wordings: { title: 'Sumá fotos', label: 'Agregar fotos', link: 'https://www.mercadolibre.com.ar/publicaciones/MLA1/modificar' } },
    { key: 'TITLE', status: 'COMPLETED', progress: 1, wordings: { title: 'Título', label: 'Listo' } },
  ] }] }],
};
const EXPERIENCE = { reputation: { color: 'orange', value: 50, text: 'Regular' }, metrics_details: { problems: [{ key: 'DAMAGED', title: { text: 'Llegó dañado' }, remedy: { text: 'Mejorá el embalaje' }, quantity: 3 }] } };

test('calidad y experiencia de compra: se leen con tolerancia', () => {
  const quality = qualityFields(PERFORMANCE);
  assert.equal(quality.quality_score, 55);
  assert.equal(quality.quality_level, 'Estándar');
  assert.deepEqual(quality.quality_pending.map((rule) => rule.label), ['Agregar fotos']);
  const experience = experienceFields(EXPERIENCE);
  assert.equal(experience.px_color, 'orange');
  assert.equal(experience.px_problems[0].title, 'Llegó dañado');
  assert.equal(experience.px_problems[0].remedy, 'Mejorá el embalaje');
  assert.deepEqual(qualityFields(null), {});
});

test('itemHealth guarda lo que llega y corta si Mercado Libre niega el permiso', async () => {
  const saved = [];
  const store = { upsert: async (table, rows) => { saved.push([table, rows]); } };
  const ok = await itemHealth({ seller_id: 1 }, 't', ['MLA1'], { store, pause: 0, get: async (path) => (path.startsWith('/item/') ? PERFORMANCE : EXPERIENCE) });
  assert.equal(ok.saved, 1);
  assert.equal(saved[0][0], 'ml_item_health');
  assert.equal(saved[0][1][0].quality_level, 'Estándar');
  let calls = 0;
  const denied = await itemHealth({ seller_id: 1 }, 't', ['A', 'B', 'C', 'D', 'E'], { store, pause: 0, get: async () => { calls += 1; throw new Error('forbidden (403)'); } });
  assert.equal(denied.saved, 0);
  assert.equal(calls, 6);
  assert.match(denied.errors[0], /no da permiso/);
});

test('qué mejorar: ordena por impacto y arma el contexto del asistente', () => {
  const items = [
    { id: 'MLA1', seller_id: '9', title: 'Espuma 750', status: 'active', sold_quantity: 300, visits_30d: 900, clips_count: 0, pictures_count: 2, description_length: 500 },
    { id: 'MLA2', seller_id: '9', title: 'Resina 1 kg', status: 'active', sold_quantity: 0, visits_30d: 120, clips_count: 0, pictures_count: 5, description_length: 10 },
    { id: 'MLA3', seller_id: '9', title: 'Pausada', status: 'paused', sold_quantity: 0, visits_30d: 500 },
  ];
  const health = [
    { id: 'MLA1', ...qualityFields(PERFORMANCE), ...experienceFields(EXPERIENCE) },
    { id: 'MLA2', quality_score: 90, quality_level: 'Profesional', quality_pending: [], px_color: 'green' },
  ];
  const plan = improvePlan({ items, health });
  assert.equal(plan.summary.active, 2);
  assert.equal(plan.summary.checked, 2);
  assert.equal(plan.quality[0].item.id, 'MLA1');
  assert.equal(plan.experience[0].item.id, 'MLA1');
  assert.deepEqual(plan.noSales.map((row) => row.item.id), ['MLA2']);
  assert.ok(plan.noSales[0].reasons.includes('sin clip'));
  assert.ok(plan.noSales[0].reasons.includes('sin descripción'));
  const text = improveContext(plan, { 9: 'POLIPLAST' });
  assert.match(text, /QUÉ MEJORAR EN MERCADO LIBRE/);
  assert.match(text, /le falta: Agregar fotos/);
  assert.match(text, /Llegó dañado → Mejorá el embalaje/);
  assert.ok(asksMlImprove('qué publicación de mercado libre mejoro primero?'));
  assert.ok(asksMlImprove('que le falta a mis publicaciones'));
  assert.ok(!asksMlImprove('cuanto rinde el easyspray'));
});
