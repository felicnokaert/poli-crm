// Publicidad de Mercado Libre (23/10): Product Ads. La API de publicidad todavía no está conectada (falta habilitar el permiso en
// la app de Mercado Libre), así que Felipe pega la tabla de campañas de cada cuenta (Publicidad → Product Ads → Campañas) y el
// CRM la ordena, la compara contra el objetivo de ROAS y marca qué mirar. Solo lee y sugiere: nunca cambia presupuestos.

const plain = (value = '') => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "$167.501" → 167501 · "21,58x" → 21.58 · "16,8%" → 16.8 · "—" → null
export function parseAmount(value) {
  const text = String(value ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!text || text === '-' || text === '--') return null;
  const normalized = /,/.test(text) ? text.replace(/\./g, '').replace(',', '.') : /\.\d{3}(\.|$)/.test(text) ? text.replace(/\./g, '') : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

const COLUMN_RULES = [
  ['roasTarget', (h) => /roas/.test(h) && /obj/.test(h)],
  ['roas', (h) => /^roas( real| actual)?$/.test(h)],
  ['name', (h) => /campa/.test(h)],
  ['budget', (h) => /presupuesto/.test(h)],
  ['sales', (h) => /^ventas/.test(h)],
  ['acos', (h) => /acos/.test(h)],
  ['spend', (h) => /inversi/.test(h)],
  ['revenue', (h) => /ingreso/.test(h)],
  ['state', (h) => /^estado/.test(h) || /vs objetivo/.test(h)],
];

function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (line.includes('|')) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim());
  if (line.includes(';')) return line.split(';').map((cell) => cell.trim());
  return null;
}

const isSeparator = (cells) => cells.every((cell) => /^[-:\s]*$/.test(cell));

export function parseAdsText(text = '') {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = {};
  let lostByBudget = null;
  let columns = null;
  let section = '';
  const campaigns = [];
  for (const line of lines) {
    const flat = plain(line);
    const budget = line.match(/presupuesto[^$\d]*\$?\s*([\d.,]+)\s*\/?\s*d[ií]a/i);
    if (budget && /total|compartido/.test(flat)) summary.budget = parseAmount(budget[1]);
    const acos = line.match(/ACOS global[^\d]*([\d.,]+)\s*%/i); if (acos) summary.acos = parseAmount(acos[1]);
    const roas = line.match(/ROAS global[^\d]*([\d.,]+)\s*x/i); if (roas) summary.roas = parseAmount(roas[1]);
    const spend = line.match(/Inversi[oó]n[^$]*\$\s*([\d.,]+)/i); if (spend && /30/.test(flat)) summary.spend = parseAmount(spend[1]);
    const revenue = line.match(/Ingresos[^$]*\$\s*([\d.,]+)/i); if (revenue && /30/.test(flat)) summary.revenue = parseAmount(revenue[1]);
    const lost = line.match(/(?:perd[eé]s|pierde)\s+(\d+)\s+ventas.*?presupuesto/i);
    if (lost) { const campaign = line.match(/(?:→|->|campa[nñ]a)\s*["“”']?\s*(.+?)["“”']?\s*$/i); lostByBudget = { sales: Number(lost[1]), campaign: campaign ? campaign[1].replace(/^campa[nñ]a\s+/i, 'Campaña ').trim() : '' }; }
    if (/^\W*(activas?|activa)\b.*\(\d+\)/i.test(flat) || /^\W*activas?\s*\(/.test(flat)) { section = 'activa'; continue; }
    if (/^\W*pausadas?\b/.test(flat)) { section = 'pausada'; continue; }
    const cells = splitRow(line);
    if (!cells || cells.length < 3) continue;
    if (isSeparator(cells)) continue;
    const header = cells.map(plain);
    if (header.some((cell) => /^campa/.test(cell)) && header.some((cell) => /roas|acos|presupuesto/.test(cell))) {
      columns = {};
      header.forEach((cell, index) => { for (const [key, rule] of COLUMN_RULES) { if (!(key in columns) && rule(cell)) { columns[key] = index; break; } } });
      continue;
    }
    if (!columns || columns.name === undefined) continue;
    const name = cells[columns.name]?.replace(/^\*+|\*+$/g, '').trim();
    if (!name) continue;
    const get = (key) => (columns[key] === undefined ? null : parseAmount(cells[columns[key]]));
    campaigns.push({
      name,
      section,
      budget: get('budget'),
      roasTarget: get('roasTarget'),
      sales: get('sales'),
      roas: get('roas'),
      acos: get('acos'),
      spend: get('spend'),
      revenue: get('revenue'),
      stateText: columns.state === undefined ? '' : cells[columns.state] || '',
      rowText: cells.join(' '),
    });
  }
  // Las pausadas pueden venir como una lista de nombres sueltos (sin tabla): se leen de la línea siguiente al título.
  return { summary, lostByBudget, campaigns };
}

// Resultado por campaña: estado y veredicto contra el objetivo de ROAS.
//  sobre  = el ROAS real supera el objetivo (si pierde ventas por presupuesto, ahí sí ayuda más presupuesto)
//  en     = dentro de ±5 % del objetivo
//  casi   = hasta 15 % por debajo: cerca, se mide unos días antes de tocar
//  bajo   = más de 15 % por debajo: no la limita el presupuesto, hay que mirar palabras clave u objetivo
export function analyzeCampaign(campaign) {
  const text = plain(`${campaign.stateText} ${campaign.rowText}`);
  const status = campaign.section === 'pausada' || /pausad/.test(text) ? 'pausada' : /aprend/.test(text) ? 'aprendiendo' : 'activa';
  let verdict = 'sin_datos';
  if (status === 'activa' && campaign.roas && campaign.roasTarget) {
    const ratio = campaign.roas / campaign.roasTarget;
    verdict = ratio >= 1.05 ? 'sobre' : ratio >= 0.95 ? 'en' : ratio >= 0.85 ? 'casi' : 'bajo';
  }
  return { ...campaign, status, verdict, ratio: campaign.roas && campaign.roasTarget ? campaign.roas / campaign.roasTarget : null };
}

export const VERDICT_TEXT = {
  sobre: ['Por encima del objetivo', 'ok'],
  en: ['En objetivo', 'ok'],
  casi: ['Cerca del objetivo', 'warn'],
  bajo: ['Por debajo del objetivo', 'bad'],
  sin_datos: ['Sin comparación', ''],
};

export const DEFAULT_WATCH = ['b2', 'PRODUCTOS-FULL', 'Activa 2 baldes', 'Balde más vendidos'];

export function matchesWatch(name, term) {
  const words = plain(term).split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = plain(name).split(/[^a-z0-9]+/).filter(Boolean);
  return words.length > 0 && words.every((word) => tokens.includes(word));
}

export function buildAdsReport(text) {
  const parsed = parseAdsText(text);
  const campaigns = parsed.campaigns.map(analyzeCampaign);
  return { summary: parsed.summary, lostByBudget: parsed.lostByBudget, campaigns };
}

// Lo que conviene mirar, siempre como sugerencia (el CRM no toca las campañas).
export function adsAdvice(campaigns = [], lostByBudget = null) {
  const active = campaigns.filter((campaign) => campaign.status === 'activa');
  return {
    raise: active.filter((campaign) => campaign.verdict === 'sobre').sort((a, b) => (b.ratio || 0) - (a.ratio || 0)),
    near: active.filter((campaign) => campaign.verdict === 'casi'),
    review: active.filter((campaign) => campaign.verdict === 'bajo').sort((a, b) => (a.ratio || 0) - (b.ratio || 0)),
    learning: campaigns.filter((campaign) => campaign.status === 'aprendiendo'),
    lost: lostByBudget,
    totalBudget: active.reduce((sum, campaign) => sum + (campaign.budget || 0), 0),
  };
}
