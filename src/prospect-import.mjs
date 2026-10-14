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
  ['provincia', 'province'], ['ciudad', 'city'], ['localidad', 'city'],
  ['familia', 'family'], ['rubro', 'rubro'], ['subfamilia', 'subfamily'],
  ['domicilio', 'address'], ['direccion', 'address'], ['fuente', 'source'],
  ['instagram', 'instagram'], ['facebook', 'facebook'],
  // Hoja RELEVAMIENTO
  ['maquina', 'machine'], ['proveedor', 'currentSupplier'], ['contacto', 'contact'], ['observaciones', 'notes'],
  ['estado', 'sheetState'], ['comercial', 'owner'], ['fecha de seguimiento', 'followUpDate'], ['tipo entidad', 'entityType'],
  ['producto propuesta', 'proposal'], ['estado comercial', 'commercialState'], ['valor potencial', 'potentialValue'],
  ['proxima accion', 'nextAction'], ['fecha proxima accion', 'nextDate'],
  // Tablas de investigación avanzada (IA)
  ['ubicacion', 'location'], ['ubicacion ciudad provincia', 'location'], ['tipo', 'rubro'], ['tamano', 'size'], ['tamano estimado', 'size'],
  ['evidencia', 'evidence'], ['evidencia con link a la fuente', 'evidence'], ['evidencia tambor ibc', 'evidence'], ['instagram facebook', 'instagram'], ['sitio', 'website'],
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

export function parseProspectsText(text = '') {
  const lines = normalizeMarkdownTable(text).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], ignored: 0, error: 'Pegá una tabla con encabezados en la primera fila y al menos un prospecto.' };
  const delimiter = detectDelimiter(lines[0]);
  const columns = splitLine(lines[0], delimiter).map((header) => HEADERS.get(plain(header)) || '');
  if (!columns.includes('company')) return { rows: [], ignored: 0, error: 'No encontré la columna "Empresa" (o "Nombre") en los encabezados.' };
  const rows = [];
  let ignored = 0;
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const row = {};
    columns.forEach((field, index) => { if (field && cells[index]) row[field] = cells[index]; });
    if (!row.company) { ignored += 1; continue; }
    rows.push(row);
  }
  return { rows, ignored, error: '' };
}

// Campos que solo existen en la planilla: se guardan juntos en `imported`.
const SHEET_ONLY = ['subfamily', 'owner', 'sheetState', 'commercialState', 'entityType', 'proposal', 'potentialValue', 'nextAction', 'nextDate', 'followUpDate'];

// Convierte una fila de la planilla en los campos de un prospecto.
export function prospectFieldsFromRow(row) {
  const fields = { ...row };
  const imported = {};
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
  const extra = [row.evidence && `Evidencia: ${row.evidence}`, row.size && `Tamaño: ${row.size}`].filter(Boolean);
  delete fields.evidence;
  delete fields.size;
  if (extra.length) fields.notes = [row.notes, ...extra].filter(Boolean).join('\n');
  fields.imported = Object.keys(imported).length ? imported : null;
  return fields;
}

// Vista previa: cruza cada fila contra las Empresas del CRM, los prospectos ya
// cargados y las filas anteriores del mismo archivo. Nada se guarda todavía.
export function buildImportPlan(rows = [], clients = [], prospects = [], { now = new Date().toISOString(), makeId = () => crypto.randomUUID() } = {}) {
  const pool = [...prospects];
  const items = [];
  const counts = { total: rows.length, nuevas: 0, enCrm: 0, yaCargadas: 0, posibles: 0 };
  for (const row of rows) {
    const candidate = blankProspect({ ...prospectFieldsFromRow(row), source: 'importado', competitor: isCompetitor(row.company) }, { id: makeId(), now });
    const check = matchProspect(candidate, clients, pool);
    const status = check.status;
    items.push({ prospect: candidate, status, match: check.matches[0] || null });
    if (status === 'Nuevo') counts.nuevas += 1;
    else if (status === 'Ya en el CRM') counts.enCrm += 1;
    else if (status === 'Ya cargado') counts.yaCargadas += 1;
    else counts.posibles += 1;
    // Las que se van a cargar entran al pool para detectar repetidas dentro del mismo archivo.
    if (status === 'Nuevo' || status === 'Posible duplicado') pool.push(candidate);
  }
  const toImport = items.filter((item) => item.status === 'Nuevo' || item.status === 'Posible duplicado').map((item) => item.prospect);
  return { items, counts, toImport };
}
