// Resumen de Mercado Libre (21/10): junta el último resumen guardado de cada cuenta (ml_account_metrics)
// y arma las alertas "para atender". Solo dice lo que muestran los datos; las alertas recomiendan, no actúan.
import { issuesOf } from './ml-board.mjs';

export const REPUTATION = {
  '5_green': ['Verde', 'ok'],
  '4_light_green': ['Verde claro', 'ok'],
  '3_yellow': ['Amarilla', 'warn'],
  '2_orange': ['Naranja', 'warn'],
  '1_red': ['Roja', 'warn'],
};
export const MEDAL = { platinum: 'MercadoLíder Platinum', gold: 'MercadoLíder Gold', silver: 'MercadoLíder' };

export function latestBySeller(rows = []) {
  const latest = {};
  for (const row of rows) if (!latest[row.seller_id] || row.taken_on > latest[row.seller_id].taken_on) latest[row.seller_id] = row;
  return latest;
}

const sum = (values) => (values.some((value) => typeof value === 'number') ? values.reduce((total, value) => total + (Number(value) || 0), 0) : null);

// Suma varias cuentas ("Todas las cuentas"). Si a una le falta un dato, el total lo avisa en `partial`.
export function combineMetrics(list = []) {
  const valid = list.filter(Boolean);
  if (!valid.length) return null;
  if (valid.length === 1) return { ...valid[0], partial: false };
  const sales = valid.map((data) => data.sales);
  const combined = {
    sales: sales.some(Boolean) ? {
      orders: sum(sales.map((item) => item?.orders)), units: sum(sales.map((item) => item?.units)),
      amount: sum(sales.map((item) => item?.amount)), cancelled: sum(sales.map((item) => item?.cancelled)),
      currency: sales.find((item) => item?.currency)?.currency || 'ARS',
    } : null,
    visits: sum(valid.map((data) => data.visits)),
    questionsPending: sum(valid.map((data) => data.questionsPending)),
    days: [],
    topItems: valid.flatMap((data) => data.topItems || []).sort((a, b) => b.amount - a.amount).slice(0, 10),
    errors: valid.flatMap((data) => data.errors || []),
    partial: valid.some((data) => !data.sales || data.visits === null),
  };
  const byDay = {};
  for (const data of valid) for (const day of data.days || []) {
    byDay[day.day] ||= { day: day.day, orders: 0, amount: 0, visits: null };
    byDay[day.day].orders += day.orders || 0;
    byDay[day.day].amount += day.amount || 0;
    if (typeof day.visits === 'number') byDay[day.day].visits = (byDay[day.day].visits || 0) + day.visits;
  }
  combined.days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  combined.conversion = combined.sales && combined.visits ? combined.sales.orders / combined.visits : null;
  return combined;
}

// Qué conviene atender primero, con la evidencia. `metricsBySeller`: { seller_id: data }.
export function buildAlerts({ metricsBySeller = {}, items = [], nickname = {} } = {}) {
  const alerts = [];
  for (const [seller, data] of Object.entries(metricsBySeller)) {
    const name = nickname[seller] || seller;
    if (data?.questionsPending > 0) alerts.push({ level: 'urgent', key: `q-${seller}`, text: `${name}: ${data.questionsPending} pregunta${data.questionsPending === 1 ? '' : 's'} sin responder`, detail: 'Responder rápido ayuda a vender y a la reputación.', href: 'https://www.mercadolibre.com.ar/preguntas/vendedor' });
    const level = data?.reputation?.level;
    if (level && REPUTATION[level]?.[1] === 'warn') alerts.push({ level: 'urgent', key: `r-${seller}`, text: `${name}: reputación ${REPUTATION[level][0].toLowerCase()}`, detail: 'Revisá reclamos, demoras y cancelaciones en Mercado Libre.' });
  }
  const active = items.filter((item) => item.status === 'active');
  const noStock = active.filter((item) => item.available_quantity === 0);
  if (noStock.length) alerts.push({ level: 'urgent', key: 'stock', text: `${noStock.length} publicaci${noStock.length === 1 ? 'ón activa' : 'ones activas'} sin stock`, detail: 'Se ven pero no se pueden comprar.', issue: 'sin-stock' });
  const bestSellers = [...active].sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0)).slice(0, 20);
  const noVideo = bestSellers.filter((item) => issuesOf(item).some((issue) => issue.key === 'sin-video'));
  if (noVideo.length) alerts.push({ level: 'tip', key: 'video', text: `${noVideo.length} de las 20 más vendidas no tienen video`, detail: 'Son las que más gente mira: ahí rinde más sumar un video.', issue: 'sin-video' });
  const fewPhotos = bestSellers.filter((item) => issuesOf(item).some((issue) => issue.key === 'pocas-fotos'));
  if (fewPhotos.length) alerts.push({ level: 'tip', key: 'fotos', text: `${fewPhotos.length} de las 20 más vendidas tienen menos de 3 fotos`, detail: 'Sumar fotos de uso y de detalle.', issue: 'pocas-fotos' });
  const noDescription = active.filter((item) => issuesOf(item).some((issue) => issue.key === 'sin-descripcion'));
  if (noDescription.length) alerts.push({ level: 'tip', key: 'desc', text: `${noDescription.length} activa${noDescription.length === 1 ? '' : 's'} sin descripción`, detail: 'La descripción responde dudas antes de que pregunten.', issue: 'sin-descripcion' });
  return alerts;
}
