// Modelo de Prospección: prospectos que todavía no son Empresa del CRM.
// Puro y testeado (test/prospect-model.test.mjs). Los prospectos viven dentro
// del workspace de cada usuario (state.prospects), así que cada comercial ve
// solo los suyos y no hace falta tocar la base.

export const PROSPECT_STATES = ['No contactado', 'Contactado', 'Con interés', 'Sin interés'];

// Detalle opcional de un toque. Un prospecto "Sin interés" o inexistente se
// guarda igual para no volver a buscarlo.
export const PROSPECT_OUTCOMES = [
  'Empresa inexistente o número inválido',
  'No respondió',
  'Ya tiene proveedor',
  'Precio',
  'No llega al mínimo de USD 1.800',
  'Dólar',
  'No vende ni usa espuma',
  'Pidió cotización',
  'No le interesa',
];

// Motivos de rechazo que se marcan en un toque en la cola (los que explican por qué falla un mensaje).
export const REJECTION_REASONS = [
  'Precio', 'No llega al mínimo de USD 1.800', 'Ya tiene proveedor', 'Dólar', 'No vende ni usa espuma', 'No respondió',
];

// Estados que convierten el prospecto en una Empresa del CRM.
export const CONVERTING_STATES = ['Contactado', 'Con interés'];

// Familias que se prospectan. `crmFamily` es la familia con la que queda la
// Empresa en el CRM (Planchas y Química no existen como familia del CRM).
// `active:false` = pausada (Pisos y Almohadas). Los rubros son el punto de
// partida de la búsqueda y se editan, no son reglas cerradas. Pisos, Almohadas y
// Baldes arrancan pausadas; cualquier usuario puede activarlas o pausarlas.
export const PROSPECT_FAMILIES = [
  { key: 'Penosil', crmFamily: 'Penosil', active: true, rubros: ['ferretería', 'corralón', 'materiales de construcción', 'pinturería', 'distribuidora ferretera'] },
  { key: 'Carrozados', crmFamily: 'Carrozados', active: true, rubros: ['carrocería', 'furgón térmico', 'motorhome', 'acoplado'] },
  { key: 'Carrozados Imperpur', crmFamily: 'Imperpur', active: true, rubros: ['carnicería', 'fiambrería', 'panadería', 'rotisería', 'distribuidora de lácteos o congelados'] },
  { key: 'Planchas', crmFamily: 'Poliuretano', active: true, rubros: ['cámaras frigoríficas', 'heladeras comerciales', 'módulos habitacionales', 'paneles', 'puertas frigoríficas', 'cajas isotérmicas'] },
  { key: 'Resinplast', crmFamily: 'Resinplast', active: true, rubros: ['astillero', 'fábrica de piscinas', 'tanques de fibra de vidrio', 'aplicador de fibra de vidrio'] },
  { key: 'PURMAC', crmFamily: 'PURMAC', active: true, rubros: ['aplicador de poliuretano proyectado', 'impermeabilización', 'pintura industrial'] },
  { key: 'Poliurea', crmFamily: 'Poliurea', active: true, rubros: ['aplicador de poliurea', 'impermeabilización', 'pintura industrial'] },
  { key: 'Poliuretano', crmFamily: 'Poliuretano', active: true, rubros: ['colchones', 'tapicería', 'aplicador de poliuretano'] },
  { key: 'Baldes', crmFamily: 'Baldes', active: false, rubros: ['heladería', 'cervecería', 'destilería', 'café de especialidad', 'panadería', 'dulces y conservas', 'growshop', 'hidroponia'] },
  { key: 'Química', crmFamily: 'Otra', active: true, rubros: ['industria con tambores', 'mantas calefactoras', 'agitadores'] },
  { key: 'EPP', crmFamily: 'EPP', active: true, venta_cruzada: true, rubros: [] },
  { key: 'Pisos', crmFamily: 'Pisos', active: false, rubros: [] },
  { key: 'Almohadas', crmFamily: 'Almohadas', active: false, rubros: [] },
];

// Competidores conocidos: se marcan como "competencia" y no entran a la lista.
export const COMPETITORS = [
  'Argenpur', 'Sulfibra', 'Bonano', 'Orlandi', 'Tecnimet', 'Fischer', 'Barovo', 'Suprabond',
  'Kuwait', 'Adhematic', 'Crossmaster', 'ECG Poliuretano', 'Satch Poliuretanos', 'Bertok',
  'Servifibras', 'Advance Coat',
  // Poliuretano, según Felipe (16/10). MAS-TIN y Penosil NO: Poliplast los distribuye, son socios (19/10).
  'Alkanos', 'Kilcom', 'Fana Quimica', 'Quimica del Caucho', 'Polytal', 'Poliresinas',
];

function plain(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isCompetitor(name = '') {
  const text = ` ${plain(name)} `;
  return COMPETITORS.some((item) => text.includes(` ${plain(item)} `));
}

export function familyConfig(key) {
  return PROSPECT_FAMILIES.find((item) => item.key === key) || null;
}

// Interruptores por familia: lo guardado por el usuario pisa el valor por defecto.
export function familyIsActive(key, switches = {}) {
  if (typeof switches?.[key] === 'boolean') return switches[key];
  return familyConfig(key)?.active ?? false;
}

export function blankProspect(fields = {}, { id, now = new Date().toISOString() } = {}) {
  return {
    id,
    company: '',
    family: '',
    rubro: '',
    address: '',
    city: '',
    province: '',
    phone: '',
    website: '',
    email: '',
    instagram: '',
    facebook: '',
    contact: '',
    machine: '',
    currentSupplier: '',
    notes: '',
    imported: null,
    osmId: '',
    lat: null,
    lon: null,
    source: 'Carga manual',
    rating: null, // reseñas del mapa (solo Google Maps)
    reviews: null,
    // De la planilla de prospección: puntaje (tal cual viene), nivel de encaje (Alto/Medio/Bajo) y zona (A/B/C).
    sheetScore: null,
    fitLevel: '',
    zone: '',
    state: 'No contactado',
    outcome: '',
    history: [],
    competitor: false,
    linkedClientId: '',
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

// WhatsApp solo se ofrece para celulares argentinos (+54 9 ...) y siempre
// como "posible": el CRM nunca manda mensajes, el contacto es manual.
export function possibleWhatsAppLink(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!/^549\d{10}$/.test(digits)) return '';
  return `https://wa.me/${digits}`;
}

// Versión del mensaje (A o B) que le toca a un prospecto: alterna por id para comparar cuál responde más.
// Se puede fijar a mano con `prospect.variant`.
export function outreachVariant(prospect = {}) {
  if (prospect.variant === 'A' || prospect.variant === 'B') return prospect.variant;
  let sum = 0;
  for (const char of String(prospect.id || prospect.company || '')) sum += char.charCodeAt(0);
  return sum % 2 === 0 ? 'A' : 'B';
}

const HISTORY_LIMIT = 20;

// Cada marca queda en el historial (fecha, estado, motivo, quién y versión del mensaje): es lo que después
// permite ver por qué falla un mensaje. El estado actual sigue siendo el último.
export function setProspectState(prospect, state, outcome = '', now = new Date().toISOString(), user = '') {
  if (!PROSPECT_STATES.includes(state)) return prospect;
  const entry = { at: now, state, outcome, user: user || '', variant: outreachVariant(prospect), family: prospect.family || '', zone: prospect.zone || '' };
  const history = [...(Array.isArray(prospect.history) ? prospect.history : []), entry].slice(-HISTORY_LIMIT);
  return { ...prospect, state, outcome, history, markedBy: user || prospect.markedBy || '', markedAt: now, updatedAt: now };
}

// Familia de prospección a partir de lo que dice una planilla ("PRFV",
// "Planchas de PUR", "carrozados imperpur"...). Si no se reconoce devuelve ''.
const FAMILY_ALIASES = {
  prfv: 'Resinplast', 'fibra de vidrio': 'Resinplast', 'planchas de pur': 'Planchas', 'plancha de poliuretano': 'Planchas',
  'planchas de poliuretano': 'Planchas', plancha: 'Planchas', poliuretanos: 'Poliuretano', quimica: 'Química',
  'carrozados sin imperpur': 'Carrozados Imperpur', imperpur: 'Carrozados Imperpur',
};

export function prospectFamilyKey(value = '') {
  const text = plain(value);
  if (!text) return '';
  const direct = PROSPECT_FAMILIES.find((item) => plain(item.key) === text);
  return direct?.key || FAMILY_ALIASES[text] || '';
}
