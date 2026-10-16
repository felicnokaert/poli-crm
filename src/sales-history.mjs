// Historial de ventas y objetivos por mes, trimestre o semestre. Nada se borra: es solo una vista sobre lo ya registrado.
import { GOAL_METRICS, netAmountInArs, netAmountInUsd, saleCommission } from './sales-model.mjs';

export const GRANULARITIES = { month: 'Mensual', quarter: 'Trimestral', semester: 'Semestral' };
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pad = (n) => String(n).padStart(2, '0');

export function bucketsFor(year, granularity = 'month') {
  const y = Number(year);
  if (granularity === 'quarter') return [1, 2, 3, 4].map((q) => ({ key: `${y}-Q${q}`, label: `T${q}`, months: [0, 1, 2].map((i) => `${y}-${pad((q - 1) * 3 + 1 + i)}`) }));
  if (granularity === 'semester') return [1, 2].map((s) => ({ key: `${y}-S${s}`, label: `S${s}`, months: Array.from({ length: 6 }, (_, i) => `${y}-${pad((s - 1) * 6 + 1 + i)}`) }));
  return Array.from({ length: 12 }, (_, i) => ({ key: `${y}-${pad(i + 1)}`, label: MONTH_NAMES[i], months: [`${y}-${pad(i + 1)}`] }));
}

export function availableYears(sales = [], goals = [], now = new Date()) {
  const years = new Set([String(now.getFullYear())]);
  for (const sale of sales) if (/^\d{4}/.test(String(sale.date || ''))) years.add(String(sale.date).slice(0, 4));
  for (const goal of goals) if (/^\d{4}/.test(String(goal.period || ''))) years.add(String(goal.period).slice(0, 4));
  return [...years].sort().reverse();
}

const monthOfQuarterGoal = (period) => { const m = String(period).match(/^(\d{4})-Q([1-4])$/); return m ? [0, 1, 2].map((i) => `${m[1]}-${pad((Number(m[2]) - 1) * 3 + 1 + i)}`) : null; };

function saleValue(sale, metric, units, fallbackRate) {
  if (metric === 'netArs') return netAmountInArs(sale);
  if (metric === 'netUsd') return netAmountInUsd(sale, fallbackRate);
  if (metric === 'commission') return saleCommission(sale, units);
  return 1;
}

// Suma los objetivos de la misma métrica que caen en el período (los trimestrales se reparten entre sus meses).
// Con una unidad elegida solo entran los objetivos de esa unidad o los generales.
function targetFor(goals, metric, bucketMonths, unit = 'Todas') {
  let total = 0; let found = false;
  const covered = new Set(bucketMonths);
  for (const goal of goals) {
    if (goal.metric !== metric) continue;
    if (unit !== 'Todas' && goal.unit && goal.unit !== 'Todas' && goal.unit !== unit) continue;
    const target = Number(goal.target) || 0;
    if (!target) continue;
    if (goal.periodType === 'quarter') {
      const months = monthOfQuarterGoal(goal.period);
      const inside = months ? months.filter((m) => covered.has(m)).length : 0;
      if (inside) { total += target * (inside / 3); found = true; }
    } else if (covered.has(goal.period)) { total += target; found = true; }
  }
  return found ? total : null;
}

// Métrica con la que más objetivos cargaste, para que el gráfico arranque mostrándolos.
export function defaultMetric(goals = []) {
  const counts = {};
  for (const goal of goals) if (goal.metric && Number(goal.target) > 0) counts[goal.metric] = (counts[goal.metric] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'netArs';
}

export function salesSeries(sales = [], goals = [], { year, granularity = 'month', metric = 'netArs', unit = 'Todas', units = {}, fallbackRate = 0 } = {}) {
  return bucketsFor(year, granularity).map((bucket) => {
    const set = new Set(bucket.months);
    const inBucket = sales.filter((sale) => set.has(String(sale.date || '').slice(0, 7)) && (unit === 'Todas' || sale.unit === unit));
    const value = inBucket.reduce((sum, sale) => sum + saleValue(sale, metric, units, fallbackRate), 0);
    const target = targetFor(goals, metric, bucket.months, unit);
    return { key: bucket.key, label: bucket.label, months: bucket.months, count: inBucket.length, value, target, pct: target ? Math.round((value / target) * 100) : null };
  });
}

export function seriesSummary(series = [], metric = 'netArs') {
  const total = series.reduce((sum, item) => sum + item.value, 0);
  const best = series.reduce((top, item) => (item.value > (top?.value ?? -1) ? item : top), null);
  const withTarget = series.filter((item) => item.target);
  const targetTotal = withTarget.reduce((sum, item) => sum + item.target, 0);
  const reached = withTarget.reduce((sum, item) => sum + item.value, 0);
  return { total, best: best && best.value > 0 ? best : null, targetTotal: withTarget.length ? targetTotal : null, pct: targetTotal ? Math.round((reached / targetTotal) * 100) : null, format: GOAL_METRICS[metric]?.format };
}
