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

function dice(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((item) => { if (b.has(item)) shared += 1; });
  return (2 * shared) / (a.size + b.size);
}

function editRatio(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = saved;
    }
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

function profileOf(record) {
  const isClient = Array.isArray(record.contacts) || record.legalName !== undefined || record.whatsappId !== undefined;
  const phones = isClient
    ? [record.phone, ...clientContacts(record).map((item) => item.phone || item.whatsappId)].map(phoneKey).filter(Boolean)
    : [phoneKey(record.phone)].filter(Boolean);
  return {
    names: [record.company, record.legalName].map(nameKey).filter(Boolean),
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
    const best = left.names.flatMap((a) => right.names.map((b) => {
      const tokensA = a.split(' ');
      const tokensB = b.split(' ');
      const shared = tokensA.filter((token) => tokensB.includes(token)).length;
      const similar = Math.max(dice(tokensA, tokensB), editRatio(a, b));
      return { shared, similar, smaller: Math.min(tokensA.length, tokensB.length) };
    })).sort((x, y) => y.similar - x.similar)[0];
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
