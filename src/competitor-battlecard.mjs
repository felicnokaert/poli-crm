// Guía de conversación frente a un competidor, armada solo con datos verificados de su ficha
// y con principios de venta de Academia: no hablar mal, no afirmar lo que no sabemos.
const FAMILY_LINES = {
  Penosil: 'selladores, espumas y adhesivos Penosil',
  Carrozados: 'poliuretano y fibra de vidrio para carrocerías',
  'Carrozados Imperpur': 'Imperpur',
  Planchas: 'planchas de poliuretano',
  Resinplast: 'resinas, gel coat y fibra de vidrio',
  PURMAC: 'equipos y repuestos Purmac y sistemas de poliuretano',
  Poliurea: 'poliurea',
  Poliuretano: 'sistemas de poliuretano',
  Química: 'químicos industriales',
};

const ASK_BY_KIND = {
  equipos: [
    '¿Qué máquina usan hoy y hace cuánto la tienen?',
    '¿Cómo les va con los repuestos y el servicio técnico?',
    '¿Qué le pedirían a su proveedor de equipos que hoy no les da?',
  ],
  default: [
    '¿Qué compran hoy y cada cuánto?',
    '¿Qué es lo que más valoran de su proveedor actual (plazo, calidad, atención, condiciones)?',
    '¿Qué le mejorarían, si pudieran?',
  ],
};

export function buildBattlecard(competitor = {}) {
  const families = (competitor.families || []).filter((name) => FAMILY_LINES[name]);
  const kind = competitor.kind === 'equipos' ? 'equipos' : 'default';
  const known = String(competitor.summary || '').trim();
  const unknown = [String(competitor.caveats || '').trim(), 'Precios, plazos y condiciones de pago: averiguarlos con el propio cliente, sin dar por cierto lo que no esté en la ficha.'].filter(Boolean);
  return {
    name: competitor.name || '',
    known,
    unknown,
    overlap: families.map((name) => `${name}: ${FAMILY_LINES[name]}`),
    ask: ASK_BY_KIND[kind],
    open: `Está muy bien que ya trabajes con ${competitor.name || 'tu proveedor actual'}. Si te parece, vemos qué necesitás y lo comparamos sin compromiso, para que tengas otra opción.`,
    avoid: [
      'No hables mal del competidor ni lo descalifiques.',
      'No afirmes precios, plazos ni características de ellos si no están en la ficha.',
      'No ofrezcas precio ni descuento antes de entender aplicación y volumen.',
    ],
  };
}

// Alta directa de un competidor por cualquier persona del equipo: queda marcado "sin revisar" hasta que alguien lo verifique.
export function slugifyCompetitor(name = '') {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function buildCompetitorRow(input = {}, now = new Date().toISOString()) {
  const name = String(input.name || '').trim();
  if (!name) return null;
  return {
    id: slugifyCompetitor(name),
    name,
    kind: ['fabricante', 'equipos', 'distribuidor'].includes(input.kind) ? input.kind : 'fabricante',
    families: input.family ? [input.family] : [],
    summary: String(input.summary || '').trim(),
    website: String(input.website || '').trim(),
    location: String(input.location || '').trim(),
    caveats: 'Cargada a mano por el equipo: falta verificar los datos.',
    reviewed: false,
    updated_at: now,
  };
}

// Lista pegada (un competidor por renglón, también separados por ";" o viñetas): nombres limpios y sin
// repetidos. "Fana/ Kilcom" queda como un solo nombre ("Fana / Kilcom").
export function parseCompetitorList(text = '') {
  const seen = new Set();
  const names = [];
  for (const raw of String(text).split(/[\n;]+/)) {
    const name = raw.replace(/^[\s\-*•·]+/, '').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
    const slug = slugifyCompetitor(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    names.push(name);
  }
  return names;
}
