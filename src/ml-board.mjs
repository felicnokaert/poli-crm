// Tablero de Mercado Libre (21/10): las publicaciones de las 3 cuentas juntas, con su estado y lo que les
// falta (video, fotos, descripción, stock, calidad). Lógica pura; los datos salen de ml_items.
import { plain, tokensOf } from './knowledge-search.mjs';

export const ML_STATUS = [
  ['active', 'Activas'],
  ['paused', 'Pausadas'],
  ['closed', 'Cerradas'],
  ['under_review', 'En revisión'],
  ['inactive', 'Inactivas'],
];
export const statusLabel = (status) => ({ active: 'Activa', paused: 'Pausada', closed: 'Cerrada', under_review: 'En revisión', inactive: 'Inactiva' }[status] || status || 'Sin estado');

// Fotos y calidad se traen desde el 21/10 (item_updated_at vacío = todavía sin ese dato). Los clips se
// cuentan aparte (clips_count): vacío = no se pudo leer o falta revisar, nunca cuenta como "sin clip".
const detailed = (item) => Boolean(item.item_updated_at);

export const ML_ISSUES = [
  ['sin-clip', 'Sin clip', (item) => item.clips_count === 0],
  ['pocas-fotos', 'Menos de 3 fotos', (item) => typeof item.pictures_count === 'number' && item.pictures_count < 3],
  ['sin-descripcion', 'Sin descripción', (item) => (Number(item.description_length) || 0) < 30],
  ['calidad-baja', 'Calidad baja', (item) => typeof item.health === 'number' && item.health < 0.7],
  ['sin-stock', 'Activa sin stock', (item) => item.status === 'active' && item.available_quantity === 0],
  ['sin-ventas', 'Activa sin ventas', (item) => item.status === 'active' && item.sold_quantity === 0],
  ['visitas-sin-ventas', 'Muchas visitas, nunca vendió', (item) => item.sold_quantity === 0 && (Number(item.visits_30d) || 0) >= 100],
];

export const issuesOf = (item) => ML_ISSUES.filter(([, , test]) => test(item)).map(([key, label]) => ({ key, label }));

export function summarizeBoard(items = []) {
  const byStatus = Object.fromEntries(ML_STATUS.map(([key]) => [key, 0]));
  for (const item of items) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const active = items.filter((item) => item.status === 'active');
  const issues = Object.fromEntries(ML_ISSUES.map(([key, , test]) => [key, active.filter(test).length]));
  return {
    total: items.length, byStatus, issues,
    missingDetail: items.filter((item) => !detailed(item)).length,
    clipsUnknown: active.filter((item) => typeof item.clips_count !== 'number').length,
    visits7: active.reduce((sum, item) => sum + (Number(item.visits_7d) || 0), 0),
    visits30: active.reduce((sum, item) => sum + (Number(item.visits_30d) || 0), 0),
  };
}

export const ML_SORTS = [
  ['vendidas', 'Más vendidas'],
  ['visitas7', 'Más visitas (7 días)'],
  ['visitas30', 'Más visitas (30 días)'],
  ['preguntas', 'Más preguntas'],
  ['precio', 'Mayor precio'],
];

export function filterBoard(items = [], { seller = '', status = '', issue = '', query = '', sort = 'vendidas' } = {}, questionCounts = {}) {
  const tokens = tokensOf(query);
  const test = ML_ISSUES.find(([key]) => key === issue)?.[2];
  return items
    .filter((item) => !seller || item.seller_id === seller)
    .filter((item) => !status || item.status === status)
    .filter((item) => !test || test(item))
    .filter((item) => {
      if (!tokens.length) return true;
      const text = plain(`${item.title} ${item.id}`);
      return tokens.every((token) => text.includes(token));
    })
    .sort((a, b) => {
      const value = (item) => ({
        vendidas: Number(item.sold_quantity) || 0,
        visitas7: Number(item.visits_7d) || 0,
        visitas30: Number(item.visits_30d) || 0,
        preguntas: questionCounts[item.id] || 0,
        precio: Number(item.price) || 0,
      }[sort] ?? (Number(item.sold_quantity) || 0));
      return value(b) - value(a) || (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0) || String(a.title).localeCompare(String(b.title), 'es');
    });
}

export function countQuestions(rows = []) {
  const counts = {};
  for (const row of rows) if (row.item_id) counts[row.item_id] = (counts[row.item_id] || 0) + 1;
  return counts;
}

// 23/10 (Felipe: "marcar con un color cada empresa de Mercado Libre"): POLIPLAST rojo, FOAMFACTORY azul, COMARG ámbar.
// Se reconoce por el apodo de la cuenta; cualquier otra queda gris.
const ACCOUNT_TONES = [[/poliplast/i, 'poliplast'], [/foam/i, 'foam'], [/comarg/i, 'comarg']];
export const ACCOUNT_COLORS = { poliplast: '#ed1c24', foam: '#2563eb', comarg: '#d97706', other: '#6b7280' };
export const accountTone = (nickname = '') => ACCOUNT_TONES.find(([pattern]) => pattern.test(String(nickname)))?.[1] || 'other';
