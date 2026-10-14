// Cola de trabajo de Prospección: a quién contactar primero. Puro y testeado.
// Más datos de contacto verificables = más arriba; competidores y duplicados confirmados no entran.
import { possibleWhatsAppLink } from './prospect-model.mjs';

export function prospectScore(prospect, check = { status: 'Nuevo' }) {
  if (prospect.competitor) return -100;
  if (check.status === 'Ya en el CRM' || check.status === 'Ya cargado') return -50;
  let score = 0;
  if (prospect.phone) score += 3;
  if (possibleWhatsAppLink(prospect.phone)) score += 1;
  if (prospect.website) score += 2;
  if (prospect.email) score += 2;
  if (prospect.instagram || prospect.facebook) score += 1;
  if (/evidencia/i.test(prospect.notes || '')) score += 2;
  if (prospect.family) score += 1;
  if (check.status === 'Posible duplicado') score -= 2;
  return score;
}

// Ids en orden de trabajo: solo "No contactado", sin competidores ni duplicados confirmados,
// sin los saltados hoy. Empata por fecha de carga (primero lo más viejo).
export function buildQueue(prospects = [], checks = new Map(), { skipped = [] } = {}) {
  const skip = new Set(skipped);
  return prospects
    .filter((item) => item.state === 'No contactado' && !skip.has(item.id))
    .map((item) => ({ item, score: prospectScore(item, checks.get(item.id)) }))
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
