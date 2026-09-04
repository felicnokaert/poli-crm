const HEADER_ALIASES = {
  title: ['titulo', 'título', 'title', 'nombre', 'tarea', 'card', 'item'],
  tag: ['etiqueta', 'tag', 'categoria', 'categoría', 'familia', 'label'],
  description: ['descripcion', 'descripción', 'notas', 'detalle', 'observaciones', 'description'],
  dueDate: ['fecha', 'vencimiento', 'due', 'duedate', 'fecha limite', 'fecha límite'],
};

function normalizeHeader(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseRows(text = '') {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; continue;
    }
    cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeDate(value = '') {
  const match = String(value).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return value.trim();
  return '';
}

// Convierte un CSV (por ejemplo exportado de Google Sheets) en tarjetas del
// Tablero. Si no reconoce una columna como título, usa la primera columna
// no vacía de la fila.
export function parseBoardCsv(text = '') {
  const rows = parseRows(text);
  if (rows.length < 2) return { cards: [], columns: [] };
  const headerMap = {};
  rows[0].forEach((header, index) => {
    const clean = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(clean)) headerMap[field] = index;
    }
  });
  const cards = rows.slice(1).map((values) => {
    const title = (headerMap.title !== undefined ? values[headerMap.title] : values.find((v) => v?.trim())) || '';
    if (!title.trim()) return null;
    return {
      title: title.trim(),
      tag: headerMap.tag !== undefined ? (values[headerMap.tag] || '').trim() : '',
      description: headerMap.description !== undefined ? (values[headerMap.description] || '').trim() : '',
      dueDate: headerMap.dueDate !== undefined ? normalizeDate(values[headerMap.dueDate]) : '',
    };
  }).filter(Boolean);
  return { cards, columns: Object.keys(headerMap) };
}
