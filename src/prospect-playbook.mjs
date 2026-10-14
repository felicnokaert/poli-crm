// Guías de prospección por familia (armadas con las guías e informes del equipo:
// público objetivo, señales que confirman, qué excluir y prompt de investigación).
// El CRM no puede usar tu suscripción de Claude/ChatGPT/Gemini por detrás (no hay API
// sin costo), así que arma el pedido completo y vos lo lanzás en la IA que prefieras
// con su modo de investigación avanzada; después se pega la tabla y se importa.
import { familyConfig } from './prospect-model.mjs';

export const AI_TOOLS = [
  { name: 'Claude', note: 'Investigación avanzada', url: 'https://claude.ai/new' },
  { name: 'ChatGPT', note: 'Deep research', url: 'https://chatgpt.com/' },
  { name: 'Gemini', note: 'Deep Research', url: 'https://gemini.google.com/app' },
  { name: 'Perplexity', note: 'Deep Research', url: 'https://www.perplexity.ai/' },
];

export const RESEARCH_MINUTES = { min: 10, max: 30 };
export const RESEARCH_COOLDOWN_DAYS = 7;
const MAX_EXCLUSIONS = 80;

export const PLAYBOOKS = {
  Penosil: {
    audience: 'Ferreterías, corralones, pinturerías y distribuidores ferreteros que podrían ser distribuidores de PENOSIL (espuma de poliuretano y selladores), fuera de la cobertura actual de Poliplast.',
    signals: ['Ya venden espuma de poliuretano o selladores de otras marcas (Fischer, Sika, Tekbond, Crossmaster, Lusqtoff), con evidencia verificable por link.', 'Varias sucursales, e-commerce activo o muchas reseñas.', 'Distribuidor oficial de marcas de construcción (Sika, Ternium, Durlock).'],
    exclude: ['Empresas que ya son clientes o distribuidores de Poliplast.', 'Negocios sin venta de insumos de construcción/ferretería.'],
    extra: 'Aclará la provincia: priorizá zonas sin distribuidor Poliplast evidente (Patagonia, Cuyo, NOA/NEA).',
  },
  Carrozados: {
    audience: 'Empresas argentinas que fabrican o carrozan vehículos, acoplados, motorhomes, tráilers, casillas rodantes o equipos especiales y usan PRFV (fibra de vidrio reforzada) como material estructural o de terminación, especialmente en paneles grandes.',
    signals: ['Menciona "PRFV", "fibra de vidrio" o "plástico reforzado" en su sitio o redes.', 'Muestra piezas grandes (paneles, cascos, monocascos).', 'Tiene planta propia con sector de laminado.', 'Mediana o grande, con compra recurrente de resina y fibra.'],
    exclude: ['Fabricantes de piscinas chicas residenciales.', 'Revendedores o distribuidores de insumos de PRFV o resina: buscamos usuarios finales.', 'Carrocería Argentina, Termax, La Carrocera, Metalúrgica Bonano, Piscinas IPC (ya contactadas).'],
    extra: 'Si mencionan competidores directos (Servifibras, Advance Coat), anotalo.',
  },
  Química: {
    audience: 'Empresas de industria química, petroquímica, pinturas, adhesivos, aceites/lubricantes o alimenticia (por ejemplo miel) que almacenan o procesan líquidos viscosos en tambores de 200 L o IBC de 1.000 L: candidatas a mantas y bandas calefactoras, válvula ardilla de bronce y agitadores neumáticos.',
    signals: ['Evidencia de tambores de 200 L o IBC (ficha técnica, catálogo, foto, nota de prensa).', 'Mediana o grande, con compra recurrente de insumos industriales.', 'Aparece como cliente público de distribuidores de estos accesorios (por ejemplo Transitflow).'],
    exclude: ['Distribuidores de accesorios para tambores: se listan aparte para decidir si son competencia o canal.'],
    extra: 'Por separado, listá 5 a 10 distribuidores o representantes de mantas, válvulas de tambor y agitadores (tipo Transitflow) para evaluar si son competencia o canal.',
  },
};

export function playbookFor(family) {
  const known = PLAYBOOKS[family];
  if (known) return { ...known, known: true };
  const rubros = familyConfig(family)?.rubros || [];
  return {
    known: false,
    audience: `Empresas argentinas que podrían comprar productos de la familia ${family}${rubros.length ? ` (rubros de partida: ${rubros.join(', ')})` : ''}.`,
    signals: ['Evidencia concreta y verificable (sitio, redes, catálogo, nota de prensa) de que usan o venden productos afines.', 'Mediana o grande, con compra recurrente.'],
    exclude: ['Competidores y revendedores que no sean usuarios finales.'],
    extra: '',
  };
}

export const RESEARCH_COLUMNS = ['Empresa', 'Rubro', 'Ubicación (ciudad, provincia)', 'Tamaño estimado', 'Evidencia (con link a la fuente)', 'Por qué encaja (1 frase)', 'Teléfono', 'Sitio web', 'Email', 'Instagram / Facebook'];

// Nombres que la IA no debe repetir: Empresas del CRM y prospectos ya cargados.
export function exclusionNames(clients = [], prospects = []) {
  const names = new Set();
  for (const item of [...clients, ...prospects]) {
    const name = String(item?.company || '').trim();
    if (name) names.add(name);
  }
  return [...names].slice(0, MAX_EXCLUSIONS);
}

export function buildResearchPrompt({ family, scope = 'todo el país', count = 20, exclusions = [], notes = '' }) {
  const book = playbookFor(family);
  const lines = [
    `Actuá como investigador comercial de Grupo Poliplast (Argentina). Hacé una investigación profunda para la familia ${family}.`,
    '',
    `PÚBLICO OBJETIVO: ${book.audience}`,
    '',
    'SEÑALES QUE CONFIRMAN QUE ENCAJA:',
    ...book.signals.map((item) => `- ${item}`),
    '',
    'EXCLUIR:',
    ...book.exclude.map((item) => `- ${item}`),
    ...(exclusions.length ? [`- Estas empresas, que ya tenemos cargadas: ${exclusions.join('; ')}.`] : []),
    '',
    `ALCANCE GEOGRÁFICO: ${scope}.`,
    `CANTIDAD: hasta ${count} empresas nuevas, priorizando las de mayor probabilidad de compra recurrente.`,
    ...(book.extra ? ['', book.extra] : []),
    ...(notes.trim() ? ['', `INDICACIONES EXTRA: ${notes.trim()}`] : []),
    '',
    'RAZONAMIENTO (hacelo antes de buscar y mostralo al principio, breve): 1) reformulá con tus palabras qué empresa estamos buscando y cuál NO; 2) definí 3 a 5 criterios de inclusión que se puedan verificar; 3) listá las búsquedas que vas a hacer (por rubro, por zona y por producto); 4) si una indicación es ambigua, elegí la interpretación más razonable y aclarala.',
    '',
    'CÓMO INVESTIGAR: buscá en Google, Google Maps, sitios web de las empresas, LinkedIn, Instagram, Facebook, directorios industriales (Guía Industrial Argentina, Kompass, cámaras del sector) y noticias. Confirmá la señal en el sitio o redes de cada empresa antes de incluirla.',
    '',
    'REGLAS: no inventes datos ni cifras; si algo no se encuentra, dejá la celda vacía. Cada fila debe tener la fuente (link) que la respalda. Si no estás seguro de que encaje, marcalo como "verificar".',
    '',
    `ENTREGA: una tabla con estas columnas exactas: ${RESEARCH_COLUMNS.join(' | ')}.`,
    'Después de la tabla, listá las empresas que descartaste y por qué (una línea cada una). Por último, repetí la misma tabla como CSV separado por punto y coma dentro de un bloque de código, para poder importarlo.',
  ];
  return lines.join('\n');
}
