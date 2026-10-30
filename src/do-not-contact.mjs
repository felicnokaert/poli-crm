// Lista de NO CONTACTAR (30/10, idea de Harvey): quien pidió que no le escribamos, o que Felipe no quiere contactar.
// Se guarda en data.doNotContact (se junta entre navegadores; al quitar una entrada queda marcada como quitada para que no reaparezca).
// Puro y testeado. Compara por mail, teléfono (últimos 8 dígitos), dominio del sitio y nombre normalizado.
const norm = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const BLOCK_KINDS = ['mail', 'telefono', 'dominio', 'nombre'];

export function normalizeValue(kind, value = '') {
  const text = String(value || '').trim();
  if (kind === 'mail') return text.toLocaleLowerCase('es-AR');
  if (kind === 'telefono') { const digits = text.replace(/\D/g, ''); return digits.length >= 8 ? digits.slice(-8) : ''; }
  if (kind === 'dominio') return text.toLocaleLowerCase('es-AR').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (kind === 'nombre') return norm(text);
  return '';
}

const entryId = (kind, value) => `${kind}:${value}`;
const GENERIC_DOMAINS = /^(gmail|hotmail|outlook|yahoo|live|icloud|msn|fibertel|arnet|speedy|facebook|instagram|wa)\./;

// Valores que identifican a una persona o empresa (cartera o prospecto).
export function identifiers(record = {}) {
  const out = [];
  const mail = normalizeValue('mail', record.email || record.mail);
  if (mail.includes('@')) out.push(['mail', mail]);
  for (const phone of [record.phone, record.whatsapp, record.mobile, record.telefono]) {
    const value = normalizeValue('telefono', phone);
    if (value) out.push(['telefono', value]);
  }
  const domain = normalizeValue('dominio', record.website || (mail.includes('@') ? '' : ''));
  if (domain && !GENERIC_DOMAINS.test(`${domain}.`)) out.push(['dominio', domain]);
  const name = normalizeValue('nombre', record.company || record.name || record.nombre);
  if (name.length >= 4) out.push(['nombre', name]);
  return out;
}

export const activeEntries = (list = []) => (Array.isArray(list) ? list : []).filter((entry) => entry && !entry.removedAt);

// Devuelve la entrada que bloquea a este registro, o null. El nombre solo bloquea si coincide exacto.
export function blockedBy(record = {}, list = []) {
  const active = activeEntries(list);
  if (!active.length) return null;
  const index = new Map(active.map((entry) => [entryId(entry.kind, entry.value), entry]));
  for (const [kind, value] of identifiers(record)) {
    const hit = index.get(entryId(kind, value));
    if (hit) return hit;
  }
  return null;
}

export const filterAllowed = (records = [], list = []) => (activeEntries(list).length ? records.filter((record) => !blockedBy(record, list)) : records);

// Agrega a la lista todo lo que identifica al registro (mail, teléfonos, dominio y nombre). No duplica; si estaba quitado, lo reactiva.
export function addBlock(list = [], record = {}, { reason = '', by = '', now = new Date().toISOString() } = {}) {
  const next = [...(Array.isArray(list) ? list : [])];
  let added = 0;
  for (const [kind, value] of identifiers(record)) {
    const id = entryId(kind, value);
    const at = next.findIndex((entry) => entry.id === id);
    const entry = { id, kind, value, label: String(record.company || record.name || record.email || value).slice(0, 80), reason: String(reason || '').slice(0, 160), by, at: now };
    if (at < 0) { next.push(entry); added += 1; }
    else if (next[at].removedAt) { next[at] = entry; added += 1; }
  }
  return { list: next, added };
}

export function addManual(list = [], { kind, value, reason = '', by = '', now = new Date().toISOString() } = {}) {
  const clean = normalizeValue(kind, value);
  if (!BLOCK_KINDS.includes(kind) || !clean || (kind === 'mail' && !clean.includes('@'))) return { list, added: 0 };
  return addBlock(list, { [kind === 'mail' ? 'email' : kind === 'telefono' ? 'phone' : kind === 'dominio' ? 'website' : 'company']: value }, { reason, by, now });
}

// Quitar no borra: marca la entrada para que el otro navegador también la saque.
export const removeBlock = (list = [], id, now = new Date().toISOString()) => (list || []).map((entry) => (entry.id === id ? { ...entry, removedAt: now } : entry));

// Junta lo de este navegador con lo remoto: gana la marca más nueva de cada entrada.
export function mergeBlocks(remote = [], local = []) {
  const map = new Map();
  for (const entry of [...(remote || []), ...(local || [])]) {
    if (!entry?.id) continue;
    const old = map.get(entry.id);
    const stamp = (item) => String(item.removedAt || item.at || '');
    if (!old || stamp(entry) >= stamp(old)) map.set(entry.id, entry);
  }
  return [...map.values()];
}
