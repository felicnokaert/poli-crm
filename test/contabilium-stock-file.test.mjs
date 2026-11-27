import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseNumber, rowsFromCsv, rowsFromXlsx, stockFromRows } from '../src/contabilium-stock-file.mjs';
import { cleanStockUpload } from '../lib/contabilium.mjs';
import { contabiliumByCode, pivotStock } from '../src/stock-model.mjs';

const HEADER = ['Depósito', 'Producto', 'Código', 'Stock Tot.', 'Stock Res.', 'Stock Disp.'];

test('números argentinos y simples', () => {
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber(7), 7);
  assert.equal(parseNumber(''), null);
});

test('junta los 4 depósitos por código y usa Stock Tot.', () => {
  const { items, products } = stockFromRows([
    ['Stock de productos'], HEADER,
    ['MAR DEL PLATA', 'POLIOL BLOQUE', '000106-POLIOL-BLOQUE', '3', '1', '2'],
    ['VILLA DOMINICO', 'POLIOL BLOQUE', '000106-POLIOL-BLOQUE', '10', '0', '10'],
    ['FULL', 'POLIOL BLOQUE', '000106-POLIOL-BLOQUE', '4', '0', '4'],
    ['CARROZADOS', 'POLIOL BLOQUE', '000106-POLIOL-BLOQUE', '0', '0', '0'],
  ]);
  assert.equal(products, 1);
  assert.deepEqual(items['000106-POLIOL-BLOQUE'].d, { mdq: 3, vd: 10, full: 4, carr: 0 });
  assert.equal(items['000106-POLIOL-BLOQUE'].t, 17);
});

test('sin columna de código lo saca de «Cód:» dentro de Producto', () => {
  const { items } = stockFromRows([['Depósito', 'Producto', 'Stock Tot.'], ['VILLA DOMINICO', 'FENOLICO 6MM C+ PINO P - Cód: 00160', '5']]);
  assert.equal(items['00160'].d.vd, 5);
  assert.equal(items['00160'].n, 'FENOLICO 6MM C+ PINO');
});

test('avisa si no es el reporte de stock', () => {
  assert.throws(() => stockFromRows([['Cliente', 'Total']]), /Depósito/);
});

test('CSV con punto y coma', () => {
  const rows = rowsFromCsv('Depósito;Código;Stock Tot.\nVILLA DOMINICO;IF-1517;"1.200,5"\n');
  assert.equal(stockFromRows(rows).items['IF-1517'].d.vd, 1200.5);
});

test('lee un .xlsx real', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
  const file = join(dir, 'stock.xlsx');
  execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
z.writestr('xl/sharedStrings.xml','<sst><si><t>Depósito</t></si><si><t>Código</t></si><si><t>Stock Tot.</t></si><si><t>MAR DEL PLATA</t></si><si><t>IF-1517</t></si></sst>')
z.writestr('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><v>460</v></c></row></sheetData></worksheet>')
z.close()`, file]);
  const buffer = readFileSync(file);
  const rows = await rowsFromXlsx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  assert.equal(stockFromRows(rows).items['IF-1517'].d.mdq, 460);
});

test('el servidor limpia lo subido y la hoja lo usa', () => {
  assert.ok(cleanStockUpload({}).error);
  const { items } = cleanStockUpload({ ' if-1517 ': { n: 'ISO', t: 460, d: { mdq: 460, raro: 9 } } });
  assert.deepEqual(items['IF-1517'].d, { mdq: 460 });
  const map = contabiliumByCode({ companies: { POLIPLAST: { items: { 'IF-1517': { t: 999, d: {} } } } }, excel: { items } });
  const [row] = pivotStock([{ sku: 'IF-1517', name: 'ISO', depot: 'Mar del Plata', at: '1', status: 'hay' }], map);
  assert.equal(row.cbMdq, 460);
  assert.equal(row.cbVd, 0);
});
