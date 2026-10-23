// Cómo se ve la competencia en Mercado Libre (23/10): precio de hoy contra hace 7 y 30 días, cuánto vendieron
// en ese tiempo (diferencia de "vendidas" entre fotos diarias) y contra nuestra publicación vinculada. Y las
// tendencias de búsqueda de nuestras categorías, marcando las que no tienen ninguna publicación nuestra.
import { plain } from './knowledge-search.mjs';

const DAY = 86400000;
const daysAgo = (today, days) => new Date(Date.parse(today) - days * DAY).toISOString().slice(0, 10);
const pct = (now, before) => (typeof now === 'number' && typeof before === 'number' && before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

// La foto más cercana a esa fecha, de ese día o antes (la primera si no hay tan vieja).
function snapshotAt(list, day) {
  let best = null;
  for (const snap of list) if (snap.taken_on <= day && (!best || snap.taken_on > best.taken_on)) best = snap;
  return best || list[0] || null;
}

export function competitionRows({ competitors = [], snapshots = [], ours = [], today }) {
  const bySnap = new Map();
  for (const snap of snapshots) {
    const key = String(snap.item_id);
    if (!bySnap.has(key)) bySnap.set(key, []);
    bySnap.get(key).push({ ...snap, taken_on: String(snap.taken_on).slice(0, 10) });
  }
  const ourById = new Map(ours.map((item) => [String(item.id), item]));
  return competitors.map((item) => {
    const list = (bySnap.get(String(item.id)) || []).sort((a, b) => a.taken_on.localeCompare(b.taken_on));
    const day = snapshotAt(list, daysAgo(today, 1));
    const week = snapshotAt(list, daysAgo(today, 7));
    const month = snapshotAt(list, daysAgo(today, 30));
    const soldSince = (snap) => (snap && typeof item.sold_quantity === 'number' && typeof snap.sold_quantity === 'number' && snap.taken_on < today ? Math.max(0, item.sold_quantity - snap.sold_quantity) : null);
    const priceChange1 = day && day.taken_on < today ? pct(item.price, day.price) : null;
    const sold1 = soldSince(day);
    // Alertas del seguimiento diario: bajó el precio más de 5 % o vendió más de 10 unidades en 24 horas.
    const alerts = [
      ...(priceChange1 != null && priceChange1 <= -5 ? [{ kind: 'precio', text: `Bajó el precio ${Math.abs(priceChange1)} % en 24 h` }] : []),
      ...(sold1 != null && sold1 > 10 ? [{ kind: 'ventas', text: `Vendió ${sold1} en 24 h` }] : []),
    ];
    const our = item.our_item_id ? ourById.get(String(item.our_item_id)) || null : null;
    return {
      item,
      who: item.competitor_name || item.seller_nickname || 'competidor',
      tracking: list.length,
      since: list[0]?.taken_on || null,
      priceChange1,
      sold1,
      alerts,
      priceChange7: week && week.taken_on < today ? pct(item.price, week.price) : null,
      priceChange30: month && month.taken_on < today ? pct(item.price, month.price) : null,
      sold7: soldSince(week),
      sold30: soldSince(month),
      our,
      vsOur: our ? pct(our.price, item.price) : null,
    };
  }).sort((a, b) => (b.sold30 ?? -1) - (a.sold30 ?? -1) || String(a.who).localeCompare(String(b.who)));
}

export function competitorSummary(rows = []) {
  const byWho = new Map();
  for (const row of rows) {
    if (!byWho.has(row.who)) byWho.set(row.who, { who: row.who, items: 0, sold30: 0, cheaper: 0, linked: 0 });
    const entry = byWho.get(row.who);
    entry.items += 1;
    entry.sold30 += row.sold30 || 0;
    if (row.vsOur != null) { entry.linked += 1; if (row.vsOur > 0) entry.cheaper += 1; }
  }
  return [...byWho.values()].sort((a, b) => b.sold30 - a.sold30);
}

// Última foto de tendencias por categoría; cada palabra marcada si alguna publicación nuestra la cubre.
export function trendsView(trends = [], ourTitles = []) {
  const latest = new Map();
  for (const row of trends) if (!latest.has(row.category_id) || row.taken_on > latest.get(row.category_id).taken_on) latest.set(row.category_id, row);
  const titles = ourTitles.map((title) => plain(title));
  return [...latest.values()].map((row) => ({
    ...row,
    keywords: (row.keywords || []).map((trend) => {
      const words = plain(trend.keyword).split(/\s+/).filter((word) => word.length > 2);
      return { ...trend, covered: words.length > 0 && titles.some((title) => words.every((word) => title.includes(word))) };
    }),
  })).sort((a, b) => String(a.category_name).localeCompare(String(b.category_name)));
}

// 23/10 (Felipe): la competencia de Mercado Libre (otros vendedores de ML) es otra cosa que la de ventas
// directas (Academia → Competencia). Solo se usa esta si la pregunta nombra Mercado Libre, o si pide tendencias.
const ML_WORDS = /\b(mercado ?libre|meli|ml|publicacion\w*|vendedores?)\b/;
export const asksMlCompetition = (query) => {
  const text = plain(query);
  return /\b(tendencia\w*|lo mas buscado|mas buscad\w*|que buscan|que se busca)\b/.test(text) || (/\bcatalogo\b/.test(text) && /\b(gana|ganan|ganador|me gana|nos gana|buy ?box)\b/.test(text)) || (/\b(competencia|competidor\w*|compit\w*|rivales?|catalogo|precio para ganar|quien gana|nos ganan?|perdemos)\b/.test(text) && ML_WORDS.test(text));
};

export function competitionContext(rows = [], trends = [], { max = 10 } = {}) {
  const lines = [];
  if (rows.length) {
    const money = (value) => (typeof value === 'number' ? `$ ${Math.round(value).toLocaleString('es-AR')}` : '—');
    lines.push('COMPETENCIA EN MERCADO LIBRE (otros vendedores de ML cuyas publicaciones sigue Felipe; NO es la lista de competidores de ventas directas de Academia, no las mezcles; vendidas = diferencia entre fotos diarias, puede no ser exacta):');
    for (const row of rows.slice(0, max)) {
      lines.push(`- ${row.who}: ${String(row.item.title).slice(0, 70)} a ${money(row.item.price)}${row.priceChange30 != null ? ` (${row.priceChange30 > 0 ? '+' : ''}${row.priceChange30} % en 30 días)` : ''}${row.sold30 != null ? `, vendió ~${row.sold30} en 30 días` : ''}${row.our ? `; la nuestra (${String(row.our.title).slice(0, 50)}) está a ${money(row.our.price)}${row.vsOur != null ? `, ${row.vsOur > 0 ? `${row.vsOur} % más cara` : `${Math.abs(row.vsOur)} % más barata`}` : ''}` : ''}.`);
    }
  }
  const open = trends.flatMap((row) => row.keywords.filter((trend) => !trend.covered).slice(0, 5).map((trend) => `${trend.keyword} (${row.category_name || row.category_id})`));
  if (open.length) lines.push(`TENDENCIAS DE BÚSQUEDA en nuestras categorías sin publicación nuestra que las nombre: ${open.slice(0, 15).join('; ')}.`);
  return lines.join('\n');
}

// CSV del seguimiento (23/10): lo que se ve en la tabla, listo para abrir en una planilla.
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
export function competitionCsv(rows = []) {
  const head = ['Vendedor', 'Título', 'Precio', 'Cambio precio 24 h %', 'Cambio precio 7 días %', 'Cambio precio 30 días %', 'Vendidas 24 h', 'Vendidas 7 días', 'Vendidas 30 días', 'Vendidas totales', 'Envío gratis', 'Estado', 'Nuestra publicación', 'Precio nuestro', 'Alertas', 'Link'];
  const lines = rows.map((row) => [
    row.who, row.item.title, row.item.price, row.priceChange1, row.priceChange7, row.priceChange30, row.sold1, row.sold7, row.sold30, row.item.sold_quantity,
    row.item.free_shipping ? 'sí' : 'no', row.item.status, row.our?.title || '', row.our?.price ?? '', row.alerts.map((alert) => alert.text).join(' | '), row.item.permalink,
  ].map(csvCell).join(','));
  return `\uFEFF${[head.map(csvCell).join(','), ...lines].join('\n')}`;
}
