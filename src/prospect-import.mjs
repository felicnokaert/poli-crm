import { blankProspect, isCompetitor, prospectFamilyKey } from './prospect-model.mjs';
import { matchProspect } from './prospect-dedupe.mjs';

// Importador de prospectos desde texto pegado o un CSV/planilla (columnas como
// la hoja RELEVAMIENTO). Detecta el separador (tab, ; o ,) y mapea encabezados
// por nombre; no inventa datos: lo que falta queda vacío.
const HEADERS = new Map([
  ['empresa', 'company'], ['nombre', 'company'], ['nombre empresa', 'company'], ['razon social', 'company'], ['negocio', 'company'],
  ['telefono', 'phone'], ['tel', 'phone'], ['celular', 'phone'], ['whatsapp', 'phone'],
  ['sitio web', 'website'], ['web', 'website'], ['website', 'website'], ['pagina web', 'website'],
  ['email', 'email'], ['mail', 'email'], ['correo', 'email'],
  ['cuit', 'cuit'], ['cuil', 'cuit'], ['cuit cuil', 'cuit'],
  ['provincia', 'province'], ['ciudad', 'city'], ['localidad', 'city'],
  ['familia', 'family'], ['rubro', 'rubro'], ['subfamilia', 'subfamily'],
  ['domicilio', 'address'], ['direccion', 'address'], ['fuente', 'source'],
  ['instagram', 'instagram'], ['facebook', 'facebook'],
  // Planilla "Prospección Octubre": puntaje, nivel de encaje y zona A/B/C.
  ['puntaje', 'sheetScore'], ['score', 'sheetScore'], ['puntaje encaje', 'sheetScore'],
  ['encaje', 'fitLevel'], ['nivel de encaje', 'fitLevel'], ['nivel encaje', 'fitLevel'],
  ['zona', 'zone'], ['zona a b c', 'zone'], ['zona abc', 'zone'],
  // Hoja RELEVAMIENTO
  ['maquina', 'machine'], ['proveedor', 'currentSupplier'], ['contacto', 'contact'], ['observaciones', 'notes'],
  ['estado', 'sheetState'], ['comercial', 'owner'], ['fecha de seguimiento', 'followUpDate'], ['tipo entidad', 'entityType'],
  ['producto propuesta', 'proposal'], ['estado comercial', 'commercialState'], ['valor potencial', 'potentialValue'],
  ['proxima accion', 'nextAction'], ['fecha proxima accion', 'nextDate'],
  // Tablas de investigación avanzada (IA)
  ['ubicacion', 'location'], ['ubicacion ciudad provincia', 'location'], ['tipo', 'rubro'], ['tamano', 'size'], ['tamano estimado', 'size'],
  ['evidencia', 'evidence'], ['evidencia con link a la fuente', 'evidence'], ['evidencia tambor ibc', 'evidence'], ['instagram facebook', 'instagram'], ['sitio', 'website'], ['por que encaja', 'fit'], ['por que encaja 1 frase', 'fit'],
]);

function plain(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Tabla en markdown (|...|) como la que devuelven las IA: se convierte a filas separadas por tab.
function normalizeMarkdownTable(text) {
  const lines = String(text).split(/\r?\n/);
  const piped = lines.filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'));
  if (piped.length < 2) return text;
  return piped
    .filter((line) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim()))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim().replace(/\t/g, ' ')).join('\t'))
    .join('\n');
}

function detectDelimiter(line = '') {
  const counts = { '\t': (line.match(/\t/g) || []).length, ';': (line.match(/;/g) || []).length, ',': (line.match(/,/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ';';
}

function splitLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') quoted = false; else current += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { cells.push(current); current = ''; } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

// Celdas con error de Excel/Sheets ("#ERROR!", "#N/A", "#¡VALOR!"...): se toman como vacías y se avisa.
const SHEET_ERROR = /^#(error!?|n\/a|n\/d|value!|valor!|¡valor!|ref!|¡ref!|div\/0!|name\?|nombre\?|num!|null!)$/i;
export const isSheetError = (value) => SHEET_ERROR.test(String(value ?? '').trim());

export function parseProspectsText(text = '') {
  const lines = normalizeMarkdownTable(text).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], ignored: 0, error: 'Pegá una tabla con encabezados en la primera fila y al menos un prospecto.' };
  const delimiter = detectDelimiter(lines[0]);
  const columns = splitLine(lines[0], delimiter).map((header) => HEADERS.get(plain(header)) || '');
  if (!columns.includes('company')) return { rows: [], ignored: 0, error: 'No encontré la columna "Empresa" (o "Nombre") en los encabezados.' };
  const rows = [];
  const cellErrors = [];
  let ignored = 0;
  for (const [lineIndex, line] of lines.slice(1).entries()) {
    const cells = splitLine(line, delimiter);
    const row = {};
    columns.forEach((field, index) => {
      if (!field || !cells[index]) return;
      if (isSheetError(cells[index])) { cellErrors.push({ row: lineIndex + 2, field, value: cells[index] }); return; }
      row[field] = cells[index];
    });
    if (!row.company) { ignored += 1; continue; }
    rows.push(row);
  }
  return { rows, ignored, cellErrors, error: '' };
}

// Campos que solo existen en la planilla: se guardan juntos en `imported`.
const SHEET_ONLY = ['subfamily', 'owner', 'sheetState', 'commercialState', 'entityType', 'proposal', 'potentialValue', 'nextAction', 'nextDate', 'followUpDate'];

// "82", "82,5", "82.5" o "8,2 / 10" → número; si no se entiende devuelve null (el texto queda en `imported`).
export function parseScore(value) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

// "Zona A", "a", "A - cerca" → 'A'. Cualquier otra cosa no se adivina.
export function normalizeZone(value) {
  const match = plain(value).match(/^(?:zona )?([abc])(?: |$)/);
  return match ? match[1].toUpperCase() : '';
}

// "alto", "Alta", "A" → Alto; "media" → Medio; "baja" → Bajo. Lo demás se guarda como vino.
export function normalizeFit(value) {
  const text = plain(value);
  if (/^(alto|alta)$/.test(text)) return 'Alto';
  if (/^(medio|media)$/.test(text)) return 'Medio';
  if (/^(bajo|baja)$/.test(text)) return 'Bajo';
  return String(value ?? '').trim();
}

// Convierte una fila de la planilla en los campos de un prospecto.
export function prospectFieldsFromRow(row) {
  const fields = { ...row };
  const imported = {};
  if ('sheetScore' in fields) {
    const score = parseScore(fields.sheetScore);
    if (score === null) imported.scoreRaw = fields.sheetScore;
    fields.sheetScore = score;
  }
  if ('zone' in fields) {
    const zone = normalizeZone(fields.zone);
    if (!zone) imported.zoneRaw = fields.zone;
    fields.zone = zone;
  }
  if ('fitLevel' in fields) fields.fitLevel = normalizeFit(fields.fitLevel);
  for (const key of SHEET_ONLY) { if (fields[key]) imported[key] = fields[key]; delete fields[key]; }
  const family = prospectFamilyKey(row.family);
  fields.family = family;
  if (row.family && !family) imported.familyRaw = row.family;
  if (!fields.rubro && row.subfamily) fields.rubro = row.subfamily;
  // "Paraná, Entre Ríos" / "Neuquén cap. + Centenario; Río Negro": la primera parte es la ciudad, el resto la provincia.
  if (row.location && !row.city) {
    const [city, ...rest] = String(row.location).split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    fields.city = city || '';
    if (!row.province && rest.length) fields.province = rest.join(', ');
  }
  delete fields.location;
  const extra = [row.evidence && `Evidencia: ${row.evidence}`, row.fit && `Por qué encaja: ${row.fit}`, row.size && `Tamaño: ${row.size}`].filter(Boolean);
  delete fields.evidence;
  delete fields.fit;
  delete fields.size;
  if (extra.length) fields.notes = [row.notes, ...extra].filter(Boolean).join('\n');
  fields.imported = Object.keys(imported).length ? imported : null;
  return fields;
}

// Huella de un archivo o texto importado (mismo contenido = misma huella, sin importar finales de línea
// ni espacios al final): para avisar si se vuelve a subir el mismo.
export function importFingerprint(text = '') {
  const clean = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n').trim();
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let index = 0; index < clean.length; index += 1) {
    const code = clean.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

// Campos que un CSV puede completar en un prospecto que ya existe, solo si están vacíos. Nunca se tocan
// el estado, la etapa, las notas ni las marcas del equipo (Contactado, Con interés, Sin interés): esos
// siempre ganan sobre el CSV.
export const FILLABLE_FIELDS = ['sheetScore', 'fitLevel', 'zone', 'family', 'rubro', 'address', 'city', 'province', 'phone', 'website', 'email', 'instagram', 'facebook', 'contact', 'machine', 'currentSupplier', 'cuit'];
const empty = (value) => value === undefined || value === null || String(value).trim() === '';

export function emptyFieldsToFill(existing = {}, incoming = {}) {
  const fill = {};
  for (const key of FILLABLE_FIELDS) if (empty(existing[key]) && !empty(incoming[key])) fill[key] = incoming[key];
  return fill;
}

// Vista previa (regla 7.3): cada fila se compara por CUIT, teléfono (últimos 8 dígitos), nombre+localidad
// y sitio web contra Empresas, contra los prospectos ya cargados y contra las filas anteriores del archivo.
// Resultado: "Nuevo", "Ya existe" o "Posible duplicado". Solo los nuevos se crean; los posibles
// duplicados se importan únicamente si la persona los elige uno por uno. A los prospectos que ya existen
// se les completan los campos vacíos, nunca se pisa uno con valor. Por eso importar el mismo CSV dos
// veces no crea ni cambia nada. Nada se guarda acá.
export function buildImportPlan(rows = [], clients = [], prospects = [], { now = new Date().toISOString(), makeId = () => crypto.randomUUID() } = {}) {
  const pool = [...prospects];
  const fresh = new Map();
  const items = [];
  const fills = new Map();
  const counts = { total: rows.length, nuevas: 0, existentes: 0, posibles: 0, enCrm: 0, aCompletar: 0 };
  for (const row of rows) {
    const fromRow = prospectFieldsFromRow(row);
    const candidate = blankProspect({ ...fromRow, source: fromRow.source || 'importado', competitor: isCompetitor(row.company) }, { id: makeId(), now });
    const check = matchProspect(candidate, clients, pool);
    const match = check.matches[0] || null;
    const status = check.status === 'Nuevo' ? 'Nuevo' : check.status === 'Posible duplicado' ? 'Posible duplicado' : 'Ya existe';
    let where = '';
    let fill = {};
    if (status === 'Ya existe') {
      counts.existentes += 1;
      if (match.kind === 'cliente') { where = 'Empresas'; counts.enCrm += 1; }
      else if (fresh.has(match.id)) {
        // Repetida dentro del mismo archivo: lo que traiga de más completa a la primera.
        where = 'este archivo';
        Object.assign(fresh.get(match.id), emptyFieldsToFill(fresh.get(match.id), candidate));
      } else {
        where = 'Prospectos';
        const existing = pool.find((item) => item.id === match.id);
        fill = emptyFieldsToFill({ ...existing, ...(fills.get(match.id) || {}) }, candidate);
        if (Object.keys(fill).length) fills.set(match.id, { ...(fills.get(match.id) || {}), ...fill });
      }
    } else if (status === 'Nuevo') {
      counts.nuevas += 1;
      pool.push(candidate);
      fresh.set(candidate.id, candidate);
    } else {
      counts.posibles += 1;
      where = match?.kind === 'cliente' ? 'Empresas' : fresh.has(match?.id) ? 'este archivo' : 'Prospectos';
    }
    items.push({ prospect: candidate, status, where, match, fill });
  }
  counts.aCompletar = fills.size;
  const updates = [...fills.entries()].map(([id, fill]) => ({ id, fill }));
  const toImport = items.filter((item) => item.status === 'Nuevo').map((item) => item.prospect);
  const possibles = items.filter((item) => item.status === 'Posible duplicado').map((item) => item.prospect);
  return { items, counts, toImport, possibles, updates };
}

// Aplica el plan confirmado a los prospectos: suma los nuevos (y los posibles duplicados elegidos) y
// completa los vacíos de los existentes. Devuelve la lista nueva y cuántos cambió.
export function applyImportPlan(prospects = [], plan = {}, { includePossibleIds = [], now = new Date().toISOString() } = {}) {
  const chosen = new Set(includePossibleIds);
  const byId = new Map((plan.updates || []).map((update) => [update.id, update.fill]));
  let updated = 0;
  const next = prospects.map((prospect) => {
    const fill = byId.get(prospect.id);
    if (!fill) return prospect;
    const safe = emptyFieldsToFill(prospect, fill);
    if (!Object.keys(safe).length) return prospect;
    updated += 1;
    return { ...prospect, ...safe, updatedAt: now };
  });
  const created = [...(plan.toImport || []), ...(plan.possibles || []).filter((item) => chosen.has(item.id))];
  return { prospects: [...next, ...created], created: created.length, updated };
}
