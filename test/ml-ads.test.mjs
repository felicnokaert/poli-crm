import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adsAdvice, analyzeCampaign, buildAdsReport, matchesWatch, parseAmount } from '../src/ml-ads.mjs';

test('importes y porcentajes como los muestra Mercado Libre', () => {
  assert.equal(parseAmount('$167.501'), 167501);
  assert.equal(parseAmount('$2.510.372'), 2510372);
  assert.equal(parseAmount('21,58x'), 21.58);
  assert.equal(parseAmount('16,8%'), 16.8);
  assert.equal(parseAmount('10x'), 10);
  assert.equal(parseAmount('—'), null);
  assert.equal(parseAmount(''), null);
});

const FOAM = `Presupuesto compartido total activo: $160.100/día | ACOS global: 11,48% | ROAS global: 8,71x | Inversión 30d: $2.510.372 | Ingresos 30d: $21.869.161
Alerta del panel: “Perdés 114 ventas extras al mes por falta de presupuesto” → Campaña varios 25/09
ACTIVAS (8)
Campaña\tPresupuesto/día\tROAS Obj\tVentas\tROAS real\tACOS\tvs objetivo
Activa 1 general\t$40.000\t10x\t61\t6,41x\t15,6%\t🔴 Por debajo
Activa 2 baldes\t$15.000\t15x\t296\t15,01x\t6,7%\t✅ En objetivo
Balde Plastico mas vendidos\t$35.000\t20x\t181\t18,67x\t5,4%\t✅ Casi en objetivo
Campaña varios 25/09\t$10.100\t4,5x\t59\t6,23x\t16,0%\t✅ Por encima
PAUSADAS (12+)
Activa 5, Campaña ACOS alto jv`;

const POLIPLAST = `| Campaña | Presupuesto/día | ROAS Obj | Ventas | ROAS | ACOS | Estado |
|---|---|---|---|---|---|---|
| **Campaña Penosil** | $26.100 | 14x | 119 | **21,58x** | **4,6%** | ✅ Excelente |
| **Compartida B2 y Best Sellers** | $15.000 | 4,5x | 0 | 0,56x | **178,7%** | 🔴 APRENDIENDO (4 días) |
| **PRODUCTOS - FULL** | $10.100 | 10x | 113 | 16,24x | **6,2%** | ⚠️ Puede mejorar |`;

test('lee el resumen, la alerta de presupuesto y la tabla de campañas (con tabulaciones)', () => {
  const report = buildAdsReport(FOAM);
  assert.deepEqual(report.summary, { budget: 160100, acos: 11.48, roas: 8.71, spend: 2510372, revenue: 21869161 });
  assert.deepEqual(report.lostByBudget, { sales: 114, campaign: 'Campaña varios 25/09' });
  assert.equal(report.campaigns.length, 4);
  const baldes = report.campaigns.find((campaign) => campaign.name === 'Activa 2 baldes');
  assert.deepEqual([baldes.budget, baldes.roasTarget, baldes.roas, baldes.acos, baldes.sales], [15000, 15, 15.01, 6.7, 296]);
  assert.equal(baldes.verdict, 'en');
});

test('lee también tablas con barras (markdown) y detecta las campañas en aprendizaje', () => {
  const report = buildAdsReport(POLIPLAST);
  assert.equal(report.campaigns.length, 3);
  assert.deepEqual(report.campaigns.map((campaign) => [campaign.name, campaign.status, campaign.verdict]), [
    ['Campaña Penosil', 'activa', 'sobre'],
    ['Compartida B2 y Best Sellers', 'aprendiendo', 'sin_datos'],
    ['PRODUCTOS - FULL', 'activa', 'sobre'],
  ]);
});

test('veredicto contra el objetivo: sobre, en objetivo y por debajo', () => {
  const make = (roas, roasTarget) => analyzeCampaign({ name: 'x', section: 'activa', roas, roasTarget, stateText: '', rowText: '' });
  assert.equal(make(21.58, 14).verdict, 'sobre');
  assert.equal(make(15.01, 15).verdict, 'en');
  assert.equal(make(18.67, 20).verdict, 'casi');
  assert.equal(make(6.41, 10).verdict, 'bajo');
  assert.equal(make(null, 10).verdict, 'sin_datos');
});

test('consejos: subir solo lo que supera el objetivo, revisar lo que no llega y esperar lo que aprende', () => {
  // Cada cuenta se pega por separado; acá se juntan dos para comprobar los tres grupos.
  const foam = buildAdsReport(FOAM);
  const advice = adsAdvice([...foam.campaigns, ...buildAdsReport(POLIPLAST).campaigns], foam.lostByBudget);
  assert.deepEqual(advice.raise.map((campaign) => campaign.name), ['PRODUCTOS - FULL', 'Campaña Penosil', 'Campaña varios 25/09']);
  assert.deepEqual(advice.review.map((campaign) => campaign.name), ['Activa 1 general']);
  assert.deepEqual(advice.near.map((campaign) => campaign.name), ['Balde Plastico mas vendidos']);
  assert.deepEqual(advice.learning.map((campaign) => campaign.name), ['Compartida B2 y Best Sellers']);
  assert.equal(advice.lost.sales, 114);
});

test('la lista de vigilancia encuentra campañas por palabras, sin acentos ni mayúsculas', () => {
  assert.equal(matchesWatch('Balde Plastico mas vendidos', 'Balde más vendidos'), true);
  assert.equal(matchesWatch('campaña b2', 'b2'), true);
  assert.equal(matchesWatch('Compartida B2 y Best Sellers', 'b2'), true);
  assert.equal(matchesWatch('PRODUCTOS - FULL', 'PRODUCTOS-FULL'), true);
  assert.equal(matchesWatch('Activa 1 general', 'Activa 2 baldes'), false);
});
