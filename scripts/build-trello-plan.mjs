// Genera src/trello-plan.mjs: reparte las tarjetas abiertas del Trello de ventas en los días hábiles
// del 16/10 al 31/12/2026, según el bloque del día de la rutina. Uso:
//   node scripts/build-trello-plan.mjs <export-trello.json>
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
const cards = JSON.parse(readFileSync(input, 'utf8')).cards.nodes;

const START = '2026-10-16';
const END = '2026-12-31';
// Feriados (a confirmar) y días que se dejan sin carga.
const HOLIDAYS = new Set(['2026-11-23', '2026-12-08', '2026-12-25']);
const LIGHT = new Set(['2026-12-07', '2026-12-24', '2026-12-31']);
// Últimos días hábiles quedan de colchón para recuperar atrasos.
const BUFFER_DAYS = 8;

const EXCLUDE_LISTS = new Set(['Terminado esta semana', '00 — Norte y métricas']);
const EXCLUDE_TITLE = [/Plan del día/i, /Pendientes ordenados/i, /Exploración Amazon/i, /Marketplace Facebook — decisión/i, /En mantenimiento/i, /Pausado esta semana/i, /corriendo en paralelo/i, /CRM — 14\/09/i];

function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const x = new Date(y, m - 1, d + n, 12); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay(); };

const days = [];
for (let d = START; d <= END; d = addDays(d, 1)) if (weekday(d) >= 1 && weekday(d) <= 5 && !HOLIDAYS.has(d)) days.push(d);
const workDays = days.filter((d) => !LIGHT.has(d));
const usable = workDays.slice(0, workDays.length - BUFFER_DAYS);

const clean = (t) => t.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim();
const shortId = (card) => card.id.split('/').pop();
const dueOf = (card) => { const due = card.due; const raw = due && typeof due === 'object' ? due.date : due; return raw ? String(raw).slice(0, 10) : ''; };
const URGENT = /🚨|🔴|⚠️|fraude|SIN DESPACHAR|Ventas cayendo|Reversión|Reputación|Triple duplicado|Stock con cargos/i;
const OVERDUE_URGENT_LISTS = new Set(['Hallazgos operativos — ML / Shopify']);

function bucketOf(card, title) {
  const list = card.list?.name || '';
  if (/clips|Lista de Grabación|Grabar tomas|Setup de Cowork|contenido/i.test(title)) return 'contenido';
  if (/^\[ML|^ML\b|^🎯 ML|Mercado Libre|^Ads|^Full |ML Poliplast|^Recategorizar|^Auditoría ML|^POLIPLAST|^🚨 FOAM|^⚠️ FOAM|^📋 FOAM|^🔴 POLIPLAST|^🔴 \[ML\]/.test(title)) return 'ml';
  if (/clips|Lista de Grabación|Grabar tomas|Setup de Cowork|contenido/i.test(title)) return 'contenido';
  if (/^\[Shopify|^Shopify|^🛍️|Catálogo Maestro|WhatsApp — completar|Penosil — (verificar|retomar)|Validar 50/.test(title)) return 'shopify';
  if (/Prospección|Cohorte|reactivación|Objetivo comercial|Objetivos Q4|formación comercial|Playbooks|Recompra|Programa de|lupa|CyberMonday|Conciliación|conciliación|Automatizaciones de Ventas/.test(title)) return 'comercial';
  return 'crm';
}

const items = [];
for (const card of cards) {
  const list = card.list?.name || '';
  const title = clean(card.name);
  if (EXCLUDE_LISTS.has(list) || EXCLUDE_TITLE.some((rx) => rx.test(title))) continue;
  items.push({ id: `trello-${shortId(card)}`, title, url: card.webUrl || card.url || '', list, trelloDue: dueOf(card), bucket: bucketOf(card, title), urgent: URGENT.test(title) || Boolean(dueOf(card) && dueOf(card) < START && OVERDUE_URGENT_LISTS.has(list)) });
}

const plan = [];
const load = {};
const put = (item, date) => { plan.push({ ...item, dueDate: date }); load[date] = (load[date] || 0) + 1; };

// 1) Fechas fijas del propio Trello que todavía están en el futuro (se respetan, corridas a día hábil).
const rest = [];
for (const item of items) {
  if (item.trelloDue && item.trelloDue >= START && usable.includes(item.trelloDue)) put(item, item.trelloDue);
  else rest.push(item);
}
// 2) Urgentes: primeros cuatro días, hasta 4 por día, en este orden de gravedad.
const RANK = [/Reputación/i, /fraude/i, /SIN DESPACHAR/i, /Stock con cargos/i, /Triple duplicado/i, /Envíos por tu cuenta/i, /Ventas cayendo/i, /Reversión/i];
const rankOf = (item) => { const i = RANK.findIndex((rx) => rx.test(item.title)); return i === -1 ? RANK.length : i; };
const urgent = rest.filter((item) => item.urgent).sort((a, b) => rankOf(a) - rankOf(b));
const normal = rest.filter((item) => !item.urgent);
const firstDays = usable.slice(0, 4);
urgent.forEach((item, index) => put(item, firstDays[Math.min(Math.floor(index / 4), firstDays.length - 1)]));
const CAP = 5;
// 3) El resto, por bloque del día.
const ALLOWED = { ml: [1, 3], shopify: [2, 4], contenido: [3], crm: [5], comercial: [1, 2, 3, 4, 5] };
const order = { 'Entrada': 0, 'Prioridad semanal': 1, 'Hallazgos operativos — ML / Shopify': 2, 'En ejecución': 0, 'Revisión': 1, 'Esperando cliente / equipo': 3 };
for (const bucket of Object.keys(ALLOWED)) {
  const list = normal.filter((item) => item.bucket === bucket).sort((a, b) => (order[a.list] ?? 5) - (order[b.list] ?? 5));
  const slots = usable.filter((d) => ALLOWED[bucket].includes(weekday(d)));
  if (!list.length) continue;
  const per = Math.max(1, Math.ceil(list.length / slots.length));
  list.forEach((item, index) => {
    let slot = Math.min(Math.floor(index / per), slots.length - 1);
    while (slot < slots.length - 1 && (load[slots[slot]] || 0) >= CAP) slot += 1;
    put(item, slots[slot]);
  });
}
plan.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (b.urgent - a.urgent));

const body = `// GENERADO por scripts/build-trello-plan.mjs (Trello de ventas, ${plan.length} tarjetas del 16/10 al 31/12/2026).
// No editar a mano: el plan se revisa en el CRM y Trello sigue siendo la fuente.
export const PLAN_START = '${START}';
export const PLAN_END = '${END}';
export const PLAN_HOLIDAYS = ${JSON.stringify([...HOLIDAYS])};
export const PLAN_LIGHT_DAYS = ${JSON.stringify([...LIGHT])};
export const TRELLO_PLAN = ${JSON.stringify(plan.map(({ id, title, url, list, bucket, dueDate, urgent }) => ({ id, title, url, list, bucket, dueDate, urgent: Boolean(urgent) })), null, 1)};
`;
writeFileSync('src/trello-plan.mjs', body);
const byBucket = {}; plan.forEach((p) => { byBucket[p.bucket] = (byBucket[p.bucket] || 0) + 1; });
console.log('tarjetas en plan:', plan.length, 'de', cards.length, byBucket, 'urgentes:', plan.filter((p) => p.urgent).length);
console.log('días usables:', usable.length, 'primer/último:', usable[0], usable.at(-1), 'máx por día:', Math.max(...Object.values(load)));
const excluded = cards.filter((c) => !plan.find((p) => p.id === `trello-${shortId(c)}`)).map((c) => `${c.list?.name} | ${clean(c.name).slice(0, 70)}`);
console.log('\nExcluidas', excluded.length); excluded.forEach((e) => console.log(' -', e));
