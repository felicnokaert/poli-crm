// Detección de duplicados entre prospectos y la cartera del CRM.
// Nunca se esconde una coincidencia dudosa: o es "ya en el CRM" (señal fuerte)
// o es "posible duplicado" para que lo decida una persona.
import { clientContacts } from './client-contacts.mjs';

const LEGAL_FORMS = new Set(['sa', 'srl', 'sas', 'sh', 'sca', 'scs', 'ltda', 'cia', 'hnos', 'hermanos', 'sociedad', 'anonima', 'responsabilidad', 'limitada', 'de', 'y', 'e', 'hijos', 'del', 'la', 'el', 'los', 'las', 'en']);

export function plainText(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Nombre sin formas societarias ni conectores: "PIERANDREI S.A." -> "pierandrei".
export function nameTokens(value = '') {
  // "S.A." / "S.R.L." -> "sa" / "srl" antes de limpiar la puntuación.
  const collapsed = String(value).toLocaleLowerCase('es-AR').replace(/\b[a-z](?:\.[a-z])+\.?/g, (match) => match.replace(/\./g, ''));
  return plainText(collapsed).split(' ').filter((token) => token && !LEGAL_FORMS.has(token));
}

export function nameKey(value = '') {
  return nameTokens(value).join(' ');
}

export function phoneKey(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

export function cuitKey(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

export function domainKey(value = '') {
  const text = String(value).trim().toLowerCase();
  if (!text) return '';
  try {
    const host = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const SOCIAL_HOSTS = new Set(['facebook.com', 'instagram.com', 'wa.me', 'linktr.ee', 'mercadolibre.com.ar']);
function usableDomain(value) {
  const domain = domainKey(value);
  return domain && !SOCIAL_HOSTS.has(domain) ? domain : '';
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((item) => { if (b.has(item)) shared += 1; });
  return (2 * shared) / (a.size + b.size);
}

// Parecido por distancia de edición. Con `atLeast`, corta apenas sabe que no llega (rápido con miles de pares).
function editRatio(left, right, atLeast = 0) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const longest = Math.max(left.length, right.length);
  const maxDistance = Math.floor((1 - atLeast) * longest);
  if (Math.abs(left.length - right.length) > maxDistance) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    let rowMin = i;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = saved;
      if (previous[j] < rowMin) rowMin = previous[j];
    }
    if (rowMin > maxDistance) return 0;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function sameCity(left, right) {
  const a = plainText(left);
  const b = plainText(right);
  return Boolean(a && b && a === b);
}

function cityUnknown(left, right) {
  return !plainText(left) || !plainText(right);
}

// El perfil de cada registro se calcula una sola vez (los registros que no cambian conservan su objeto).
const profiles = new WeakMap();
function profileOf(record) {
  if (record && typeof record === 'object' && profiles.has(record)) return profiles.get(record);
  const profile = buildProfile(record);
  if (record && typeof record === 'object') profiles.set(record, profile);
  return profile;
}

function buildProfile(record) {
  const isClient = Array.isArray(record.contacts) || record.legalName !== undefined || record.whatsappId !== undefined;
  const phones = isClient
    ? [record.phone, ...clientContacts(record).map((item) => item.phone || item.whatsappId)].map(phoneKey).filter(Boolean)
    : [phoneKey(record.phone)].filter(Boolean);
  const names = [record.company, record.legalName].map(nameKey).filter(Boolean);
  return {
    names,
    nameParts: names.map((key) => ({ key, tokens: key.split(' '), set: new Set(key.split(' ')) })),
    cuit: cuitKey(record.cuit),
    phones: [...new Set(phones)],
    domain: usableDomain(record.website),
    city: record.city || '',
  };
}

// Señales entre un prospecto y otro registro (empresa o prospecto).
export function compareRecords(prospect, other) {
  const left = profileOf(prospect);
  const right = profileOf(other);
  const signals = [];
  if (left.cuit && left.cuit === right.cuit) signals.push({ type: 'cuit', strong: true, label: 'CUIT exacto' });
  if (left.phones.some((item) => right.phones.includes(item))) signals.push({ type: 'telefono', strong: true, label: 'Teléfono exacto' });
  if (left.domain && left.domain === right.domain) signals.push({ type: 'sitio_web', strong: true, label: 'Mismo sitio web' });

  const exact = left.names.some((item) => right.names.includes(item));
  if (exact) {
    if (sameCity(left.city, right.city)) signals.push({ type: 'nombre_y_localidad', strong: true, label: 'Mismo nombre y localidad' });
    else signals.push({ type: 'nombre', strong: false, label: cityUnknown(left.city, right.city) ? 'Mismo nombre (falta la localidad)' : 'Mismo nombre, otra localidad' });
  } else {
    // Parecidos pero no iguales: se necesitan al menos 2 palabras en común para
    // no confundir "Imperio Motorhome" con "IMPERIO S.R.L.".
    let best = null;
    for (const a of left.nameParts) {
      for (const b of right.nameParts) {
        let shared = 0;
        for (const token of a.tokens) if (b.set.has(token)) shared += 1;
        const byTokens = dice(a.set, b.set);
        const similar = Math.max(byTokens, editRatio(a.key, b.key, 0.85));
        if (!best || similar > best.similar) best = { shared, similar, smaller: Math.min(a.tokens.length, b.tokens.length) };
      }
    }
    if (best && best.similar >= 0.85 && (best.shared >= 2 || best.smaller === 1 || best.similar >= 0.9)) {
      signals.push({ type: 'nombre_parecido', strong: false, label: 'Nombre parecido' });
    }
  }
  return signals;
}

export function statusFor(signals, kind = 'cliente') {
  if (!signals.length) return 'Nuevo';
  if (!signals.some((item) => item.strong)) return 'Posible duplicado';
  return kind === 'cliente' ? 'Ya en el CRM' : 'Ya cargado';
}

// Compara un prospecto contra las Empresas del CRM y contra otros prospectos.
// Devuelve el estado, las coincidencias (con sus señales) y la mejor ficha.
export function matchProspect(prospect, clients = [], prospects = []) {
  const matches = [];
  for (const client of clients) {
    const signals = compareRecords(prospect, client);
    if (signals.length) matches.push({ kind: 'cliente', id: client.id, name: client.company, signals, status: statusFor(signals, 'cliente') });
  }
  for (const other of prospects) {
    if (!other || other.id === prospect.id) continue;
    const signals = compareRecords(prospect, other);
    if (signals.length) matches.push({ kind: 'prospecto', id: other.id, name: other.company, signals, status: statusFor(signals, 'prospecto') });
  }
  const rank = { 'Ya en el CRM': 0, 'Ya cargado': 1, 'Posible duplicado': 2 };
  matches.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.kind === 'cliente' ? -1 : 1));
  const status = matches.length ? matches[0].status : 'Nuevo';
  const bestClient = matches.find((item) => item.kind === 'cliente');
  return { status, matches, bestClient: bestClient || null };
}

// Huella de lo que usa la comparación (nombres, CUIT, teléfonos, sitio, localidad). Si no cambia —por
// ejemplo, al clasificar un prospecto solo cambia su estado—, no hace falta volver a comparar todo.
export function matchSignature(prospects = [], clients = []) {
  const part = (record) => {
    const profile = profileOf(record);
    return [record.id, record.company, record.legalName, profile.cuit, profile.phones.join(','), profile.domain, profile.city].join('\u0001');
  };
  return `${prospects.map(part).join('\u0002')}\u0003${clients.map(part).join('\u0002')}`;
}

function recordKey(record) {
  const profile = profileOf(record);
  return [record.company, record.legalName, profile.cuit, profile.phones.join(','), profile.domain, profile.city].join('\u0001');
}

// Versión incremental de matchProspect para toda la lista: recuerda las comparaciones anteriores y solo
// compara de nuevo lo que cambió (al marcar "Contactado" se suma UNA empresa: 513 comparaciones, no 900 mil).
// Da exactamente lo mismo que llamar a matchProspect(prospecto, clients, prospects) para cada uno.
export function createMatcher() {
  let prevProspects = new Map();
  let prevClients = new Map();
  let found = new Map(); // prospectId -> { clients: Map(id -> signals), prospects: Map(id -> signals) }

  return function matchAll(prospects = [], clients = []) {
    const nextProspects = new Map();
    const nextClients = new Map();
    for (const item of prospects) if (item) nextProspects.set(item.id, recordKey(item));
    for (const item of clients) if (item) nextClients.set(item.id, recordKey(item));
    const changedClients = clients.filter((item) => item && prevClients.get(item.id) !== nextClients.get(item.id));
    const changedProspects = prospects.filter((item) => item && prevProspects.get(item.id) !== nextProspects.get(item.id));
    const changedClientIds = new Set(changedClients.map((item) => item.id));
    const changedProspectIds = new Set(changedProspects.map((item) => item.id));
    const nextFound = new Map();

    for (const prospect of prospects) {
      if (!prospect) continue;
      const fresh = changedProspectIds.has(prospect.id) || !found.has(prospect.id);
      const old = fresh ? null : found.get(prospect.id);
      const entry = { clients: new Map(), prospects: new Map() };
      const clientPool = fresh ? clients : changedClients;
      if (old) for (const [id, signals] of old.clients) if (nextClients.has(id) && !changedClientIds.has(id)) entry.clients.set(id, signals);
      for (const client of clientPool) {
        if (!client) continue;
        const signals = compareRecords(prospect, client);
        if (signals.length) entry.clients.set(client.id, signals);
      }
      const prospectPool = fresh ? prospects : changedProspects;
      if (old) for (const [id, signals] of old.prospects) if (nextProspects.has(id) && !changedProspectIds.has(id)) entry.prospects.set(id, signals);
      for (const other of prospectPool) {
        if (!other || other.id === prospect.id) continue;
        const signals = compareRecords(prospect, other);
        if (signals.length) entry.prospects.set(other.id, signals);
      }
      nextFound.set(prospect.id, entry);
    }
    prevProspects = nextProspects;
    prevClients = nextClients;
    found = nextFound;

    const result = new Map();
    for (const prospect of prospects) {
      if (!prospect) continue;
      const entry = nextFound.get(prospect.id);
      const matches = [];
      for (const client of clients) {
        const signals = client && entry.clients.size ? entry.clients.get(client.id) : null;
        if (signals) matches.push({ kind: 'cliente', id: client.id, name: client.company, signals, status: statusFor(signals, 'cliente') });
      }
      for (const other of prospects) {
        const signals = other && entry.prospects.size ? entry.prospects.get(other.id) : null;
        if (signals) matches.push({ kind: 'prospecto', id: other.id, name: other.company, signals, status: statusFor(signals, 'prospecto') });
      }
      const rank = { 'Ya en el CRM': 0, 'Ya cargado': 1, 'Posible duplicado': 2 };
      matches.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.kind === 'cliente' ? -1 : 1));
      const bestClient = matches.find((item) => item.kind === 'cliente');
      result.set(prospect.id, { status: matches.length ? matches[0].status : 'Nuevo', matches, bestClient: bestClient || null });
    }
    return result;
  };
}
