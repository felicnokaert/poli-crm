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

// Video, fotos y calidad se traen desde el 21/10: una publicación sin ese dato todavía (item_updated_at
// vacío) no cuenta como "sin video" hasta la próxima actualización.
const detailed = (item) => Boolean(item.item_updated_at);

export const ML_ISSUES = [
  ['sin-video', 'Sin video', (item) => detailed(item) && !item.video_id],
  ['pocas-fotos', 'Menos de 3 fotos', (item) => typeof item.pictures_count === 'number' && item.pictures_count < 3],
  ['sin-descripcion', 'Sin descripción', (item) => (Number(item.description_length) || 0) < 30],
  ['calidad-baja', 'Calidad baja', (item) => typeof item.health === 'number' && item.health < 0.7],
  ['sin-stock', 'Activa sin stock', (item) => item.status === 'active' && item.available_quantity === 0],
  ['sin-ventas', 'Activa sin ventas', (item) => item.status === 'active' && item.sold_quantity === 0],
];

export const issuesOf = (item) => ML_ISSUES.filter(([, , test]) => test(item)).map(([key, label]) => ({ key, label }));

export function summarizeBoard(items = []) {
  const byStatus = Object.fromEntries(ML_STATUS.map(([key]) => [key, 0]));
  for (const item of items) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const active = items.filter((item) => item.status === 'active');
  const issues = Object.fromEntries(ML_ISSUES.map(([key, , test]) => [key, active.filter(test).length]));
  return { total: items.length, byStatus, issues, missingDetail: items.filter((item) => !detailed(item)).length };
}

export function filterBoard(items = [], { seller = '', status = '', issue = '', query = '' } = {}, questionCounts = {}) {
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
    .sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0)
      || (questionCounts[b.id] || 0) - (questionCounts[a.id] || 0)
      || String(a.title).localeCompare(String(b.title), 'es'));
}

export function countQuestions(rows = []) {
  const counts = {};
  for (const row of rows) if (row.item_id) counts[row.item_id] = (counts[row.item_id] || 0) + 1;
  return counts;
}
