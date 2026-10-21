// Guías por producto (Academia → Productos, 19/10). Viven en la tabla product_guides: borradores armados
// solo con el texto de las fichas técnicas validadas, cada una con sus fuentes. Felipe las valida.
import { plain, tokensOf } from './knowledge-search.mjs';

export const GUIDE_FAMILY_ORDER = ['Poliuretano', 'PURMAC', 'Poliurea', 'Resinplast', 'Penosil', 'Imperpur', 'Otra'];

export function guideText(guide = {}) {
  const items = (guide.sections || []).flatMap((section) => [section.title, ...(section.items || [])]);
  return [guide.summary, ...items].filter(Boolean).join(' ');
}

export function guideFamilies(guides = []) {
  const present = new Set(guides.map((guide) => guide.family));
  return [...GUIDE_FAMILY_ORDER.filter((family) => present.has(family)), ...[...present].filter((family) => !GUIDE_FAMILY_ORDER.includes(family)).sort()];
}

// Filtra por familia y por palabras (en el nombre del producto pesa más). Ordena por familia y nombre.
export function filterGuides(guides = [], { family = 'Todas', query = '' } = {}) {
  const tokens = tokensOf(query);
  const order = (guide) => {
    const at = GUIDE_FAMILY_ORDER.indexOf(guide.family);
    return at === -1 ? GUIDE_FAMILY_ORDER.length : at;
  };
  return guides
    .filter((guide) => family === 'Todas' || guide.family === family)
    .map((guide) => {
      if (!tokens.length) return { guide, score: 1 };
      const title = plain(guide.product);
      const body = plain(guideText(guide));
      let score = 0;
      for (const token of tokens) {
        if (title.includes(token)) score += 3;
        else if (body.includes(token)) score += 1;
        else return { guide, score: 0 };
      }
      return { guide, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || order(a.guide) - order(b.guide) || a.guide.product.localeCompare(b.guide.product, 'es'))
    .map((row) => row.guide);
}

// Texto para copiar a WhatsApp o a la IA de cada uno: solo lo que dice la guía, con sus fuentes.
export function guideToText(guide = {}) {
  const lines = [`${guide.product}`, guide.summary || ''];
  for (const section of guide.sections || []) {
    lines.push('', `${section.title}:`);
    for (const item of section.items || []) lines.push(`- ${item}`);
  }
  const sources = (guide.sources || []).map((source) => source.title).filter(Boolean);
  if (sources.length) lines.push('', `Fuente: ${sources.join(' · ')}`);
  if (guide.status !== 'validada') lines.push('(Borrador sin validar: confirmar antes de pasar datos a un cliente.)');
  return lines.join('\n').trim();
}

// Búsqueda de lo que ya se respondió en Mercado Libre sobre una guía (21/10): palabras del nombre del
// producto unidas con "or" (la base ordena por relevancia), sin las marcas de línea que no dicen nada.
const LINE_WORDS = new Set(['isobunker', 'purmac', 'poli', 'plus', 'resinplast', 'imperpur', 'para', 'con', 'los', 'las', 'del']);
export function guideMlQuery(guide = {}) {
  const words = plain(guide.product).replace(/[^a-z0-9 -]/g, ' ').split(/[\s-]+/).filter((word) => word.length > 2 && !LINE_WORDS.has(word));
  return [...new Set(words)].slice(0, 5).join(' or ');
}
