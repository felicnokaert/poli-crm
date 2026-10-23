// Cola de trabajo de Prospección: a quién contactar primero. Puro y testeado.
// Más datos de contacto verificables = más arriba; competidores y duplicados confirmados no entran.
import { possibleWhatsAppLink } from './prospect-model.mjs';
import { DEFAULT_RULES, normalizeRules } from './prospect-rules.mjs';

// Aporte de la planilla de prospección (puntaje, encaje y zona) al orden de la cola. El puntaje se toma de 0 a 100
// (si viene de 0 a 10 se pasa a esa escala); suma hasta 4. Encaje Alto suma 3 y Medio 1; zona A suma 2 y B 1.
export function sheetBonus(prospect = {}, rules = DEFAULT_RULES) {
  let bonus = 0;
  const score = Number(prospect.sheetScore);
  if (Number.isFinite(score) && score > 0) bonus += Math.min(rules.sheetScoreMax, Math.round((score > 10 ? score : score * 10) / 25));
  if (prospect.fitLevel === 'Alto') bonus += rules.fitHigh;
  else if (prospect.fitLevel === 'Medio') bonus += rules.fitMedium;
  if (prospect.zone === 'A') bonus += rules.zoneA;
  else if (prospect.zone === 'B') bonus += rules.zoneB;
  return bonus;
}

export function prospectScore(prospect, check = { status: 'Nuevo' }, rules = DEFAULT_RULES) {
  if (prospect.competitor) return -100;
  if (check.status === 'Ya en el CRM' || check.status === 'Ya cargado') return -50;
  let score = 0;
  if (prospect.phone) score += rules.phone;
  if (possibleWhatsAppLink(prospect.phone)) score += rules.whatsapp;
  if (prospect.website) score += rules.website;
  if (prospect.email) score += rules.email;
  if (prospect.instagram || prospect.facebook) score += rules.social;
  if (/evidencia/i.test(prospect.notes || '')) score += rules.evidence;
  if (prospect.family) score += rules.family;
  if (prospect.research?.score) score += Math.round(prospect.research.score / 20);
  score += sheetBonus(prospect, rules);
  if (check.status === 'Posible duplicado') score -= rules.duplicate;
  return score;
}

// Ids en orden de trabajo: solo "No contactado", sin competidores ni duplicados confirmados,
// sin los saltados hoy. Empata por fecha de carga (primero lo más viejo).
export function buildQueue(prospects = [], checks = new Map(), { skipped = [], rules = DEFAULT_RULES } = {}) {
  const skip = new Set(skipped);
  const active = normalizeRules(rules);
  return prospects
    .filter((item) => item.state === 'No contactado' && !skip.has(item.id))
    .map((item) => ({ item, score: prospectScore(item, checks.get(item.id), active) }))
    .filter((entry) => entry.score > -50)
    .sort((a, b) => b.score - a.score || String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')))
    .map((entry) => entry.item.id);
}

// Qué falta para poder contactarlo: ayuda a decidir si primero hay que enriquecerlo.
export function missingContact(prospect) {
  const missing = [];
  if (!prospect.phone && !prospect.email && !prospect.instagram && !prospect.facebook) missing.push('ningún dato de contacto');
  else {
    if (!prospect.phone) missing.push('teléfono');
    if (!prospect.email) missing.push('mail');
  }
  if (!prospect.website) missing.push('sitio web');
  return missing;
}
