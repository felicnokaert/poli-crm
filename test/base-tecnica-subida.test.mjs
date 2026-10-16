import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { nextFreeName, planUpload, resolveUpload, targetPathFor, folderOptions } from '../src/technical-upload-plan.mjs';
import { canExtractText, officeText, xmlToText } from '../src/document-text.mjs';

// ZIP mínimo (como un .docx) con entradas comprimidas.
function zip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name); const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes); offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, centralBytes, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

test('lee el texto de un Word (.docx) sin librerías', async () => {
  const docx = zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Poliol 618</w:t></w:r></w:p><w:p><w:r><w:t>Densidad 40 kg/m³ &amp; más</w:t></w:r></w:p></w:body></w:document>' });
  assert.equal(await officeText(docx, 'docx'), 'Poliol 618\nDensidad 40 kg/m³ & más');
});

test('lee Excel con textos compartidos y números', async () => {
  const xlsx = zip({
    'xl/sharedStrings.xml': '<sst><si><t>Producto</t></si><si><t>Precio</t></si><si><t>618</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5.5</v></c></row></sheetData></worksheet>',
  });
  assert.equal(await officeText(xlsx, 'xlsx'), 'Producto\tPrecio\n618\t5.5');
});

test('xmlToText y formatos que se leen', () => {
  assert.equal(xmlToText('<a:p><a:t>Hola</a:t></a:p><a:p><a:t>chau</a:t></a:p>'), 'Hola\nchau');
  assert.equal(canExtractText('ficha.PDF'), true);
  assert.equal(canExtractText('nota.md'), true);
  assert.equal(canExtractText('viejo.doc'), false);
});

test('nombre libre al estilo Windows: (1), (2)…', () => {
  assert.equal(nextFreeName('Ficha 618.pdf', ['Ficha 618.pdf']), 'Ficha 618 (1).pdf');
  assert.equal(nextFreeName('Ficha 618.pdf', ['ficha 618.pdf', 'Ficha 618 (1).pdf']), 'Ficha 618 (2).pdf');
  assert.equal(nextFreeName('Ficha 618 (1).pdf', ['Ficha 618 (1).pdf']), 'Ficha 618 (2).pdf');
});

const existing = [
  { id: 'd1', title: 'Ficha 618', sourceFile: 'PRODUCTOS/POLIOLES/Ficha 618.pdf', sha256: 'aaa', status: 'vigente' },
  { id: 'd2', title: 'Manual', sourceFile: 'MANUALES/Manual.pdf', sha256: 'bbb' },
];

test('detecta mismo nombre en la carpeta y mismo archivo en cualquier lado', () => {
  const items = planUpload([
    { key: '1', name: 'Ficha 618.pdf', relativePath: 'Ficha 618.pdf', sha256: 'nuevo' },
    { key: '2', name: 'Copia.pdf', relativePath: 'Copia.pdf', sha256: 'bbb' },
    { key: '3', name: 'Nueva.docx', relativePath: 'Nueva.docx', sha256: 'ccc' },
  ], existing, { destination: 'PRODUCTOS / POLIOLES' });
  assert.equal(items[0].conflict, 'mismo_nombre');
  assert.equal(items[0].choice, 'keepBoth');
  assert.equal(items[0].keepBothName, 'Ficha 618 (1).pdf');
  assert.equal(items[1].conflict, 'mismo_archivo');
  assert.equal(items[1].choice, 'skip');
  assert.equal(items[2].conflict, null);
  assert.equal(items[2].target, 'PRODUCTOS/POLIOLES/Nueva.docx');
  const plan = resolveUpload(items, { 1: 'replace' });
  assert.deepEqual(plan.replace.map((item) => item.existing.id), ['d1']);
  assert.deepEqual(plan.skip.map((item) => item.key), ['2']);
  assert.deepEqual(plan.create.map((item) => item.target), ['PRODUCTOS/POLIOLES/Nueva.docx']);
  assert.deepEqual(resolveUpload(items).create.map((item) => item.target), ['PRODUCTOS/POLIOLES/Ficha 618 (1).pdf', 'PRODUCTOS/POLIOLES/Nueva.docx']);
});

test('dos archivos con el mismo nombre en la misma subida no se pisan', () => {
  const items = planUpload([
    { key: 'a', name: 'Ficha.pdf', relativePath: 'Ficha.pdf', sha256: 'x1' },
    { key: 'b', name: 'Ficha.pdf', relativePath: 'Ficha.pdf', sha256: 'x2' },
    { key: 'c', name: 'Igual.pdf', relativePath: 'Igual.pdf', sha256: 'x1' },
  ], [], { destination: 'NUEVA' });
  assert.equal(items[0].conflict, null);
  assert.equal(items[1].keepBothName, 'Ficha (1).pdf');
  assert.equal(items[2].conflict, 'mismo_archivo');
});

test('carpeta entera: mantiene subcarpetas debajo del destino (o no, si se pide)', () => {
  const file = { name: 'a.pdf', relativePath: 'Drive/POLIUREA/a.pdf' };
  assert.equal(targetPathFor(file, { destination: 'PRODUCTOS', keepStructure: true }), 'PRODUCTOS/Drive/POLIUREA/a.pdf');
  assert.equal(targetPathFor(file, { destination: 'PRODUCTOS', keepStructure: false }), 'PRODUCTOS/a.pdf');
  assert.equal(targetPathFor({ name: 'b.pdf', relativePath: 'b.pdf' }, { destination: '' }), 'b.pdf');
  assert.deepEqual(folderOptions(existing), ['MANUALES', 'PRODUCTOS / POLIOLES']);
});
