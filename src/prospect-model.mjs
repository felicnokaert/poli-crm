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
  'Pidió cotización',
  'No le interesa',
];

// Estados que convierten el prospecto en una Empresa del CRM.
export const CONVERTING_STATES = ['Contactado', 'Con interés'];

// Familias que se prospectan. `crmFamily` es la familia con la que queda la
// Empresa en el CRM (Planchas y Química no existen como familia del CRM).
// `active:false` = pausada (Pisos y Almohadas). Los rubros son el punto de
// partida de la búsqueda y se editan, no son reglas cerradas.
export const PROSPECT_FAMILIES = [
  { key: 'Penosil', crmFamily: 'Penosil', active: true, rubros: ['ferretería', 'corralón', 'materiales de construcción', 'pinturería', 'distribuidora ferretera'] },
  { key: 'Carrozados', crmFamily: 'Carrozados', active: true, rubros: ['carrocería', 'furgón térmico', 'motorhome', 'acoplado'] },
  { key: 'Carrozados Imperpur', crmFamily: 'Imperpur', active: true, rubros: ['carnicería', 'fiambrería', 'panadería', 'rotisería', 'distribuidora de lácteos o congelados'] },
  { key: 'Planchas', crmFamily: 'Poliuretano', active: true, rubros: ['cámaras frigoríficas', 'heladeras comerciales', 'módulos habitacionales', 'paneles', 'puertas frigoríficas', 'cajas isotérmicas'] },
  { key: 'Resinplast', crmFamily: 'Resinplast', active: true, rubros: ['astillero', 'fábrica de piscinas', 'tanques de fibra de vidrio', 'aplicador de fibra de vidrio'] },
  { key: 'PURMAC', crmFamily: 'PURMAC', active: true, rubros: ['aplicador de poliuretano proyectado', 'impermeabilización', 'pintura industrial'] },
  { key: 'Poliurea', crmFamily: 'Poliurea', active: true, rubros: ['aplicador de poliurea', 'impermeabilización', 'pintura industrial'] },
  { key: 'Poliuretano', crmFamily: 'Poliuretano', active: true, rubros: ['colchones', 'tapicería', 'aplicador de poliuretano'] },
  { key: 'Baldes', crmFamily: 'Baldes', active: true, rubros: ['heladería', 'cervecería', 'destilería', 'café de especialidad', 'panadería', 'dulces y conservas', 'growshop', 'hidroponia'] },
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
    source: 'Carga manual',
    state: 'No contactado',
    outcome: '',
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

export function setProspectState(prospect, state, outcome = '', now = new Date().toISOString(), user = '') {
  if (!PROSPECT_STATES.includes(state)) return prospect;
  return { ...prospect, state, outcome, markedBy: user || prospect.markedBy || '', markedAt: now, updatedAt: now };
}
