// Ventas → Mercado Libre → "Qué mejorar" (23/10): junta lo que Mercado Libre dice de cada publicación
// (calidad y experiencia de compra, lib/ml-health.mjs) con lo que ya sabemos (visitas, ventas, clips, fotos,
// descripción) y lo ordena por impacto: primero lo que más se ve y más vende. También lo usa el asistente.
import { plain } from './knowledge-search.mjs';

const SEVERITY = { red: 3, orange: 2, yellow: 1 };
const COLOR_LABEL = { red: 'rojo', orange: 'naranja', yellow: 'amarillo', green: 'verde', gray: 'sin datos' };
export const colorLabel = (color) => COLOR_LABEL[String(color || '').toLowerCase()] || String(color || '');
const isProfessional = (level) => /profesional|professional/i.test(String(level || ''));

// Cuánto pesa una publicación: visitas del mes y ventas totales (con tope para que lo viejo no tape lo nuevo).
export const impact = (item) => (Number(item?.visits_30d) || 0) + Math.min(Number(item?.sold_quantity) || 0, 500);

export function lowQuality(h) {
  if (!h) return false;
  if (h.quality_level) return !isProfessional(h.quality_level);
  return typeof h.quality_score === 'number' && h.quality_score < 70;
}

export function reasonsFor(item, h) {
  const reasons = [];
  if (item.clips_count === 0) reasons.push('sin clip');
  if (typeof item.pictures_count === 'number' && item.pictures_count < 3) reasons.push(`${item.pictures_count} foto${item.pictures_count === 1 ? '' : 's'}`);
  if ((Number(item.description_length) || 0) < 30) reasons.push('sin descripción');
  if (lowQuality(h)) reasons.push(`calidad ${h.quality_level || h.quality_score}`);
  if (SEVERITY[String(h?.px_color || '').toLowerCase()]) reasons.push(`experiencia de compra en ${colorLabel(h.px_color)}`);
  return reasons;
}

export function improvePlan({ items = [], health = [], seller = '', max = 50 } = {}) {
  const byId = new Map(health.map((row) => [String(row.id), row]));
  const active = items.filter((item) => item && item.status === 'active' && (!seller || String(item.seller_id) === String(seller)));
  const checked = active.filter((item) => byId.has(String(item.id)));
  const rows = active.map((item) => ({ item, h: byId.get(String(item.id)) || null }));
  const byImpact = (a, b) => impact(b.item) - impact(a.item);

  const quality = rows.filter(({ h }) => lowQuality(h)).sort(byImpact).slice(0, max)
    .map((row) => ({ ...row, actions: (row.h.quality_pending || []).slice(0, 4) }));
  const experience = rows.filter(({ h }) => SEVERITY[String(h?.px_color || '').toLowerCase()])
    .sort((a, b) => (SEVERITY[String(b.h.px_color).toLowerCase()] - SEVERITY[String(a.h.px_color).toLowerCase()]) || byImpact(a, b)).slice(0, max);
  const noSales = rows.filter(({ item }) => item.sold_quantity === 0 && (Number(item.visits_30d) || 0) >= 50).sort(byImpact).slice(0, max)
    .map((row) => ({ ...row, reasons: reasonsFor(row.item, row.h) }));

  const scores = checked.map((item) => byId.get(String(item.id)).quality_score).filter((value) => typeof value === 'number');
  const levels = {};
  for (const item of checked) {
    const level = byId.get(String(item.id)).quality_level || 'sin nivel';
    levels[level] = (levels[level] || 0) + 1;
  }
  return {
    summary: {
      active: active.length,
      checked: checked.length,
      averageScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
      levels,
      lowQuality: rows.filter(({ h }) => lowQuality(h)).length,
      badExperience: rows.filter(({ h }) => SEVERITY[String(h?.px_color || '').toLowerCase()]).length,
      noSales: rows.filter(({ item }) => item.sold_quantity === 0 && (Number(item.visits_30d) || 0) >= 50).length,
    },
    quality,
    experience,
    noSales,
  };
}

const ASK_ML = /\b(mercado ?libre|ml|publicacion\w*|calidad|clips?|reclam\w*|experiencia de compra|visitas)\b/;
const ASK_FIX = /\b(mejor\w*|arregl\w*|falla\w*|problema\w*|conviene|prioridad|priorizo|que hago|que le falta|le falta|calidad|reclam\w*|baj\w*|empiezo|primero|revisar|no tienen|sin|faltan?)\b/;
export const asksMlImprove = (query) => { const text = plain(query); return ASK_ML.test(text) && ASK_FIX.test(text); };

export function improveContext(plan, nickname = {}, { max = 8 } = {}) {
  if (!plan?.summary?.checked) return '';
  const name = (item) => `${String(item.title || item.id).slice(0, 70)} (${nickname[item.seller_id] || 'cuenta'}, ${Number(item.visits_30d) || 0} visitas/30 días, ${Number(item.sold_quantity) || 0} vendidas)`;
  const { summary } = plan;
  const lines = [`QUÉ MEJORAR EN MERCADO LIBRE (lo que dice Mercado Libre de cada publicación; revisadas ${summary.checked} de ${summary.active} activas${summary.averageScore != null ? `, calidad promedio ${summary.averageScore}/100` : ''}):`];
  if (plan.quality.length) lines.push(`- Calidad por debajo de Profesional (${summary.lowQuality}), las que más pesan:`, ...plan.quality.slice(0, max).map(({ item, h, actions }) => `  · ${name(item)}: calidad ${h.quality_level || h.quality_score}${actions.length ? `; le falta: ${actions.map((action) => action.label || action.title).join(', ')}` : ''}`));
  if (plan.experience.length) lines.push(`- Experiencia de compra con problemas (${summary.badExperience}):`, ...plan.experience.slice(0, max).map(({ item, h }) => `  · ${name(item)}: ${colorLabel(h.px_color)}${(h.px_problems || []).length ? `; ${(h.px_problems || []).map((problem) => [problem.title, problem.remedy].filter(Boolean).join(' → ')).join('; ')}` : ''}`));
  if (plan.noSales.length) lines.push(`- Muchas visitas y nunca vendieron (${summary.noSales}):`, ...plan.noSales.slice(0, max).map(({ item, reasons }) => `  · ${name(item)}${reasons.length ? `: ${reasons.join(', ')}` : ': revisar precio y competencia'}`));
  return lines.join('\n');
}
