// Búsqueda global (Ctrl/Cmd+K): empresas, tareas y prospectos en una sola caja.
import { plain, tokensOf } from './knowledge-search.mjs';

const MAX = 6;

function pick(list, tokens, kind, map) {
  return list
    .map((item) => {
      const view = map(item);
      const title = plain(view.title);
      const all = plain(`${view.title} ${view.subtitle} ${view.extra || ''}`);
      const score = tokens.reduce((sum, t) => sum + (title.includes(t) ? 3 : 0) + (all.includes(t) ? 1 : 0), 0);
      return { ...view, kind, score, hit: tokens.every((t) => all.includes(t)) };
    })
    .filter((row) => row.hit)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
}

export function globalSearch(query, { clients = [], tasks = [], prospects = [] } = {}) {
  const tokens = tokensOf(query);
  if (!tokens.length) return [];
  return [
    ...pick(clients, tokens, 'empresa', (c) => ({ id: c.id, title: c.company || '(sin nombre)', subtitle: [c.city, c.province, c.type].filter(Boolean).join(' · '), extra: `${c.contact || ''} ${c.phone || ''} ${c.email || ''} ${c.notes || ''}` })),
    ...pick(tasks.filter((t) => !t.deleted && !t.done), tokens, 'tarea', (t) => ({ id: t.id, title: t.title, subtitle: [t.company, t.dueDate].filter(Boolean).join(' · '), extra: t.trigger || '' })),
    ...pick(prospects, tokens, 'prospecto', (p) => ({ id: p.id, title: p.company || '(sin nombre)', subtitle: [p.city, p.province, p.family].filter(Boolean).join(' · '), extra: `${p.rubro || ''} ${p.phone || ''}` })),
  ];
}
