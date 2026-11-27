// Stock por depósito desde el Excel de Contabilium (Reportes → Productos → Stock → botón de descarga), 27/11.
// La API de Contabilium no da el stock por depósito (probado en producción: /api/conceptos/* solo trae el total y
// /api/inventarios/getDepositos devuelve una lista vacía), así que se sube el archivo que exporta ese reporte.
// Lee .xlsx (sin librerías) o .csv; columnas por nombre: Depósito, Código (o «Cód: X» dentro de Producto), Producto y
// Stock Tot. (si no está, Stock Disp.). Devuelve { items: { CODIGO: { n, t, d: { vd, mdq, full, carr, other } } } }.
import { readZipTextEntries, xmlToText } from './document-text.mjs';

const plain = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const normCode = (code = '') => String(code).trim().toUpperCase().replace(/\s+/g, '');

export function fileDepot(name = '') {
  const text = plain(name);
  if (!text) return '';
  if (/berazategui/.test(text)) return 'old';
  if (/dominico|\bvd\b/.test(text)) return 'vd';
  if (/mar del plata|\bmdq\b|\bmdp\b/.test(text)) return 'mdq';
  if (/\bfull\b/.test(text)) return 'full';
  if (/carrozad/.test(text)) return 'carr';
  return 'other';
}

export function parseNumber(value) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!text || text === '-') return null;
  if (text.includes(',') && text.includes('.')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const columnIndex = (ref = '') => {
  const letters = String(ref).match(/^[A-Z]+/)?.[0] || '';
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
};

// .xlsx → filas (arrays de celdas, respetando la columna de cada celda).
export async function rowsFromXlsx(buffer) {
  const [shared] = await readZipTextEntries(buffer, (name) => name === 'xl/sharedStrings.xml');
  const strings = shared ? [...shared.text.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => xmlToText(match[1]).trim()) : [];
  const sheets = await readZipTextEntries(buffer, (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheet = sheets.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0];
  if (!sheet) return [];
  return [...sheet.text.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = [];
    for (const [, attrs, inner] of row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attrs.match(/r="([A-Z]+)\d*"/)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const raw = inner?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? inner?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
      cells[index] = /t="s"/.test(attrs) ? strings[Number(raw)] ?? '' : xmlToText(raw).trim();
    }
    return Array.from(cells, (cell) => cell ?? '');
  });
}

export function rowsFromCsv(text = '') {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  const sep = [';', '\t', ','].sort((a, b) => (lines[0]?.split(b).length || 0) - (lines[0]?.split(a).length || 0))[0];
  return lines.map((line) => {
    const out = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
      else if (char === sep && !quoted) { out.push(cell.trim()); cell = ''; }
      else cell += char;
    }
    out.push(cell.trim());
    return out;
  });
}

// Filas → items por código. Error claro si no encuentra las columnas.
export function stockFromRows(rows = []) {
  const headerAt = rows.findIndex((row) => row.some((cell) => /deposito/.test(plain(cell))) && row.some((cell) => /stock/.test(plain(cell))));
  if (headerAt < 0) throw new Error('No encontré las columnas «Depósito» y «Stock». ¿Es el Excel de Reportes → Productos → Stock?');
  const header = rows[headerAt].map(plain);
  const find = (test) => header.findIndex(test);
  const depotCol = find((cell) => /deposito/.test(cell));
  const codeCol = find((cell) => /^cod|codigo|sku/.test(cell));
  const nameCol = find((cell) => /producto|nombre|descripcion/.test(cell));
  let qtyCol = find((cell) => /stock\s*tot/.test(cell));
  if (qtyCol < 0) qtyCol = find((cell) => /stock\s*disp/.test(cell));
  if (qtyCol < 0) qtyCol = find((cell) => /^stock/.test(cell));
  if (qtyCol < 0) throw new Error('No encontré la columna «Stock Tot.».');
  const items = {};
  let lines = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const depot = fileDepot(row[depotCol]);
    const productText = nameCol >= 0 ? String(row[nameCol] || '') : '';
    let code = codeCol >= 0 ? row[codeCol] : '';
    if (!code) code = productText.match(/c[oó]d\.?:?\s*([^\s]+)/i)?.[1] || '';
    code = normCode(code);
    const qty = parseNumber(row[qtyCol]);
    if (!depot || !code || qty == null) continue;
    const name = productText.replace(/\s*[A-Z]?\s*-?\s*c[oó]d\.?:?\s*\S+\s*$/i, '').trim();
    const item = items[code] || { n: name, t: 0, d: {} };
    item.d[depot] = (item.d[depot] || 0) + qty;
    if (depot !== 'old') item.t += qty;
    if (!item.n && name) item.n = name;
    items[code] = item;
    lines += 1;
  }
  return { items, lines, products: Object.keys(items).length };
}

export async function readStockFile(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Ese archivo es .xls viejo: abrilo en Excel y guardalo como .xlsx (o CSV) y subilo de nuevo.');
  const rows = name.endsWith('.csv') || name.endsWith('.txt') ? rowsFromCsv(await file.text()) : await rowsFromXlsx(await file.arrayBuffer());
  return stockFromRows(rows);
}
