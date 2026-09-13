import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';
import { PRODUCT_CATALOG } from '../../src/product-catalog.mjs';

const outputDir = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const outputPath = `${outputDir}Plantillas_Administracion_Catalogo_Inventario_v1.xlsx`;
const previewDir = `${outputDir}preview_plantillas`;
const wb = Workbook.create();

const colors = {
  red: '#E31E25', dark: '#262626', gray: '#747474', light: '#F5F5F3',
  input: '#FFF4CC', error: '#FDE8E7', white: '#FFFFFF', green: '#E6F3EC',
};
const font = 'Arial';

const distinct = [];
const seen = new Set();
for (const item of PRODUCT_CATALOG) {
  const key = `${item.family}|${item.subfamily}`;
  if (seen.has(key) || item.validation !== 'Audited') continue;
  seen.add(key);
  distinct.push(item);
  if (distinct.length === 12) break;
}

function baseSheet(name, title, note, columns, rows, widths) {
  const sheet = wb.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.tabColor = name === 'Instrucciones' ? colors.dark : colors.red;
  sheet.getRange(`A2:${String.fromCharCode(64 + columns.length)}2`).merge();
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format = { font: { name: font, size: 15, bold: true, color: colors.dark } };
  sheet.getRange(`A3:${String.fromCharCode(64 + columns.length)}3`).merge();
  sheet.getRange('A3').values = [[note]];
  sheet.getRange('A3').format = { font: { name: font, size: 10, italic: true, color: colors.gray } };
  sheet.getRange(`A4:${String.fromCharCode(64 + columns.length)}4`).values = [columns];
  sheet.getRange(`A4:${String.fromCharCode(64 + columns.length)}4`).format = {
    fill: colors.dark,
    font: { name: font, size: 10, bold: true, color: colors.white },
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true,
    borders: { preset: 'inside', style: 'thin', color: '#FFFFFF' },
  };
  const lastRow = Math.max(4 + rows.length, 204);
  if (rows.length) sheet.getRangeByIndexes(4, 0, rows.length, columns.length).values = rows;
  sheet.getRangeByIndexes(4, 0, lastRow - 4, columns.length).format = {
    font: { name: font, size: 10, color: colors.dark }, verticalAlignment: 'center',
  };
  sheet.getRangeByIndexes(4, 0, lastRow - 4, columns.length).format.fill = colors.input;
  columns.forEach((_, idx) => { sheet.getRangeByIndexes(0, idx, lastRow, 1).format.columnWidth = widths[idx]; });
  sheet.getRange(`A4:${String.fromCharCode(64 + columns.length)}${lastRow}`).format.borders = {
    insideHorizontal: { style: 'thin', color: '#E2E2DF' },
    bottom: { style: 'thin', color: '#C8C8C4' },
  };
  sheet.freezePanes.freezeRows(4);
  const table = sheet.tables.add(`A4:${String.fromCharCode(64 + columns.length)}${lastRow}`, true, `${name.replace(/[^A-Za-z]/g, '')}ImportTable`);
  table.style = 'TableStyleMedium2';
  table.showFilterButton = true;
  return { sheet, lastRow };
}

const guide = wb.worksheets.add('Instrucciones');
guide.showGridLines = false;
guide.tabColor = colors.dark;
guide.getRange('A2:F2').merge();
guide.getRange('A2').values = [['Plantillas administrativas · Catálogo, precios e inventario']];
guide.getRange('A2').format = { font: { name: font, size: 16, bold: true, color: colors.dark } };
guide.getRange('A4:F4').values = [['Hoja', 'Uso', 'Identificador', 'Quién puede aplicar', 'Qué ocurre con errores', 'Fuente esperada']];
guide.getRange('A4:F4').format = { fill: colors.dark, font: { name: font, size: 10, bold: true, color: colors.white }, wrapText: true, horizontalAlignment: 'center' };
guide.getRange('A5:F8').values = [
  ['Catalogo', 'Alta/corrección de identidad y clasificación', 'SKU', 'Administrador', 'No se crea ni modifica la variante', 'Catálogo Maestro v12'],
  ['Costos', 'Actualizar costos por lote', 'SKU existente', 'Administrador', 'La fila se bloquea', 'Contabilium o fuente aprobada'],
  ['Precios', 'Actualizar listas y escalas', 'SKU + lista + cantidad mínima', 'Administrador', 'La fila se bloquea', 'Lista comercial verificada'],
  ['Stock', 'Importar conteo físico por depósito', 'SKU + depósito + fecha', 'Administrador / conteo aprobado', 'La fila se bloquea', 'Sesión de conteo o Contabilium'],
];
guide.getRange('A10:F10').merge();
guide.getRange('A10').values = [['Reglas obligatorias']];
guide.getRange('A10').format = { fill: colors.red, font: { name: font, size: 11, bold: true, color: colors.white } };
guide.getRange('A11:F16').merge(true);
guide.getRange('A11:A16').values = [
  ['1. No cambies los nombres de las columnas.'],
  ['2. Una celda vacía significa pendiente; nunca equivale a cero.'],
  ['3. El sistema muestra una vista previa antes de aplicar cualquier lote.'],
  ['4. Un SKU desconocido o repetido queda para revisión.'],
  ['5. Stock contado no significa stock disponible para prometer.'],
  ['6. Costos y rentabilidad solo se exportan con permiso de administrador.'],
];
guide.getRange('A11:F16').format = { font: { name: font, size: 11, color: colors.dark }, fill: colors.light };
guide.getRange('A18:F18').merge();
guide.getRange('A18').values = [['Muestra incluida: SKU de la semilla auditada del CRM. Antes de producción se reemplazará por el Catálogo Maestro v12 completo. No contiene costos, precios ni stock inventados.']];
guide.getRange('A18').format = { font: { name: font, size: 10, italic: true, color: colors.gray }, wrapText: true };
['A','B','C','D','E','F'].forEach((col, i) => { guide.getRange(`${col}:${col}`).format.columnWidth = [18,38,24,26,34,34][i]; });
guide.getRange('A4:F8').format.borders = { insideHorizontal: { style: 'thin', color: '#D7D7D3' }, bottom: { style: 'thin', color: '#BEBEB8' } };
guide.getRange('A4:F18').format.verticalAlignment = 'center';
guide.getRange('A4:F18').format.wrapText = true;

const catalogRows = distinct.map((i) => [i.sku, i.name, i.family, i.subfamily || '', 'unidad', true]);
const cat = baseSheet('Catalogo', 'Importación de catálogo', 'Campos amarillos editables. Las altas requieren nombre y familia; un SKU nunca se corrige por similitud.', ['sku','name','family','subfamily','unit','active'], catalogRows, [20,38,20,24,14,12]);
cat.sheet.getRange(`F5:F${cat.lastRow}`).dataValidation = { rule: { type: 'list', values: ['TRUE','FALSE'] } };

const costRows = distinct.map((i) => [i.sku, '', '', '', '']);
const costs = baseSheet('Costos', 'Actualización masiva de costos', 'Los importes vacíos permanecen pendientes. El costo y su fuente deben cargarse juntos.', ['sku','cost','costCurrency','costSource','costValidFrom'], costRows, [20,16,18,38,18]);
costs.sheet.getRange(`C5:C${costs.lastRow}`).dataValidation = { rule: { type: 'list', values: ['ARS','USD'] } };
costs.sheet.getRange(`B5:B${costs.lastRow}`).setNumberFormat('#,##0.00');
costs.sheet.getRange(`E5:E${costs.lastRow}`).setNumberFormat('yyyy-mm-dd');

const priceRows = distinct.map((i) => [i.sku, '', '', '', '', 1, '', '', '']);
const prices = baseSheet('Precios', 'Actualización masiva de listas de precios', 'Una fila representa una escala de una variante. No cargues un valor sin lista, moneda, fuente y vigencia.', ['sku','priceList','price','currency','vatRate','minQuantity','validFrom','validUntil','source'], priceRows, [20,24,16,14,14,18,18,18,38]);
prices.sheet.getRange(`D5:D${prices.lastRow}`).dataValidation = { rule: { type: 'list', values: ['ARS','USD'] } };
prices.sheet.getRange(`C5:C${prices.lastRow}`).setNumberFormat('#,##0.00');
prices.sheet.getRange(`E5:E${prices.lastRow}`).setNumberFormat('0.0%');
prices.sheet.getRange(`F5:F${prices.lastRow}`).setNumberFormat('#,##0.00');
prices.sheet.getRange(`G5:H${prices.lastRow}`).setNumberFormat('yyyy-mm-dd');

const stockRows = distinct.map((i) => [i.sku, '', '', 'unidad', '', '']);
const stock = baseSheet('Stock', 'Importación de conteo físico', 'La carga registra cantidades contadas por depósito y fecha. La aprobación administrativa genera el saldo visible.', ['sku','locationId','quantity','unit','countedAt','source'], stockRows, [20,20,18,16,20,38]);
stock.sheet.getRange(`C5:C${stock.lastRow}`).setNumberFormat('#,##0.00');
stock.sheet.getRange(`E5:E${stock.lastRow}`).setNumberFormat('yyyy-mm-dd hh:mm');

for (const sheetName of ['Catalogo','Costos','Precios','Stock']) {
  const sh = wb.worksheets.getItem(sheetName);
  sh.getUsedRange().format.verticalAlignment = 'center';
}

wb.recalculate();
await fs.mkdir(previewDir, { recursive: true });
for (const sheetName of ['Instrucciones','Catalogo','Costos','Precios','Stock']) {
  const blob = await wb.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`${previewDir}/${sheetName}.png`, new Uint8Array(await blob.arrayBuffer()));
}
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outputPath);

const inspect = await wb.inspect({ kind: 'sheet,table', maxChars: 5000, tableMaxRows: 6, tableMaxCols: 10 });
const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' });
console.log(inspect.ndjson);
console.log(errors.ndjson);
console.log(outputPath);
