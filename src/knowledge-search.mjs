// Buscador de conocimiento de la Academia: una sola búsqueda sobre productos, fichas técnicas,
// clientes, vendedores, objeciones y competencia. Sin IA: coincidencia de palabras, y un armado de
// consulta con los datos reales para pegar en la IA de cada uno. No inventa nada.
const STOP = new Set(['que', 'para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'como', 'cual', 'cuales', 'sus', 'este', 'esta', 'hay', 'tiene', 'sirve', 'usar', 'uso']);

export const KNOWLEDGE_TYPES = [
  ['productos', 'Productos'],
  ['guias', 'Guías de producto'],
  ['fichas', 'Fichas técnicas'],
  ['clientes', 'Clientes'],
  ['vendedores', 'Vendedores'],
  ['objeciones', 'Objeciones'],
  ['competencia', 'Competencia'],
];

export function plain(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokensOf(query) {
  return [...new Set(plain(query).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)))];
}

function scoreItem(item, tokens) {
  const title = plain(item.title);
  const text = plain(item.text);
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (text.includes(token)) score += 1;
  }
  return score;
}

// Normaliza cada fuente a { type, id, title, subtitle, text }.
export function toItems({ products = [], guides = [], docs = [], clients = [], sellers = [], objections = [], competitors = [] } = {}) {
  return [
    ...guides.map((g) => {
      const body = [g.summary, ...(g.sections || []).flatMap((section) => section.items || [])].join(' ');
      return { type: 'guias', id: g.id, title: g.product, subtitle: [g.family, g.status === 'validada' ? 'validada' : 'borrador sin validar'].join(' · '), text: body, fullText: body };
    }),
    ...products.map((p) => ({ type: 'productos', id: p.sku || p.name, title: p.name, subtitle: [p.family, p.subfamily, p.sku].filter(Boolean).join(' · '), text: [p.family, p.subfamily, p.base, p.variant].join(' ') })),
    ...docs.filter((d) => d.status === 'vigente' || d.status === undefined).map((d) => ({ type: 'fichas', id: d.id || d.title, title: d.product || d.title, subtitle: [d.family, d.doc_type, d.sku].filter(Boolean).join(' · '), text: [d.title, d.notes, d.extractedText ?? d.extracted_text].join(' '), fullText: d.extractedText ?? d.extracted_text ?? '' })),
    ...clients.map((c) => ({ type: 'clientes', id: c.id || c.company, title: c.company, subtitle: [c.type, c.city, c.province].filter(Boolean).join(' · '), text: [c.rubro, c.notes, c.family, c.products].join(' ') })),
    ...sellers.map((s) => ({ type: 'vendedores', id: s.id, title: `${s.name} · ${s.role}`, subtitle: s.area, text: [s.area, s.receives, s.risk, s.habit, ...(s.assist || [])].join(' ') })),
    ...objections.map((o) => ({ type: 'objeciones', id: o.id, title: o.label, subtitle: 'Objeción', text: [o.meaning, o.explore, o.response].join(' ') })),
    ...competitors.filter((c) => c.kind !== 'cliente').map((c) => ({ type: 'competencia', id: c.id || c.name, title: c.name, subtitle: (c.families || []).join(' · '), text: [c.summary, c.caveats, ...(c.families || [])].join(' ') })),
  ];
}

// Pedacito del texto de la ficha donde aparece lo buscado (17/10: el buscador ahora lee el texto completo de las
// fichas). Prioriza el lugar donde aparecen más palabras de la búsqueda juntas.
export function snippetFor(text, tokens, radius = 90) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source || !tokens.length) return '';
  const flat = plain(source);
  let best = -1;
  let bestHits = 0;
  for (const token of tokens) {
    for (let at = flat.indexOf(token); at !== -1; at = flat.indexOf(token, at + 1)) {
      const window = flat.slice(Math.max(0, at - radius), at + radius);
      const hits = tokens.filter((t) => window.includes(t)).length;
      if (hits > bestHits) { best = at; bestHits = hits; }
    }
  }
  if (best < 0) return '';
  const start = Math.max(0, best - radius);
  const end = Math.min(source.length, best + radius);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}

export function searchKnowledge(query, sources, { perType = 5 } = {}) {
  const tokens = tokensOf(query);
  const groups = Object.fromEntries(KNOWLEDGE_TYPES.map(([key]) => [key, []]));
  if (!tokens.length) return { tokens, groups, total: 0 };
  const scored = toItems(sources).map((item) => ({ item, score: scoreItem(item, tokens) })).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score);
  for (const { item } of scored) if (groups[item.type].length < perType) groups[item.type].push(item.fullText ? { ...item, snippet: snippetFor(item.fullText, tokens) } : item);
  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  return { tokens, groups, total };
}

// Texto para pegar en la IA de cada uno, con lo que el CRM sabe de verdad.
export function buildKnowledgePrompt(query, result) {
  const lines = ['Consulta comercial de Grupo Poliplast (datos reales del CRM):', '', `Pregunta: ${query || '(sin especificar)'}`];
  for (const [key, label] of KNOWLEDGE_TYPES) {
    const list = result.groups[key] || [];
    if (!list.length) continue;
    lines.push('', `${label}:`);
    for (const item of list) lines.push(`- ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''}${item.snippet ? `. ${item.type === 'guias' ? 'La guía dice' : 'La ficha dice'}: "${item.snippet}"` : ''}`);
  }
  if (!result.total) lines.push('', 'El CRM no encontró datos propios sobre esto: respondé con conocimiento general y avisá que no hay respaldo de Poliplast.');
  lines.push('', 'Respondé solo con lo listado. No inventes precio, stock, rendimiento, dosificación ni compatibilidad; si falta un dato, decilo.');
  return lines.join('\n');
}
