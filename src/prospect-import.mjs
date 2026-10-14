// Importador de prospectos desde texto pegado o un CSV/planilla (columnas como
// la hoja RELEVAMIENTO). Detecta el separador (tab, ; o ,) y mapea encabezados
// por nombre; no inventa datos: lo que falta queda vacío.
const HEADERS = new Map([
  ['empresa', 'company'], ['nombre', 'company'], ['nombre empresa', 'company'], ['razon social', 'company'], ['negocio', 'company'],
  ['telefono', 'phone'], ['tel', 'phone'], ['celular', 'phone'], ['whatsapp', 'phone'],
  ['sitio web', 'website'], ['web', 'website'], ['website', 'website'], ['pagina web', 'website'],
  ['email', 'email'], ['mail', 'email'], ['correo', 'email'],
  ['provincia', 'province'], ['ciudad', 'city'], ['localidad', 'city'],
  ['familia', 'family'], ['rubro', 'rubro'], ['tipo', 'rubro'],
  ['domicilio', 'address'], ['direccion', 'address'], ['fuente', 'source'],
  ['instagram', 'instagram'], ['facebook', 'facebook'],
]);

function plain(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim());
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
