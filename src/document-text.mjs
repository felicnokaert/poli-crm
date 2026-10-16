// Texto de los archivos que se suben a Base técnica, para que el copiloto aprenda de ellos.
// PDF con pdf.js; Word (.docx), Excel (.xlsx) y PowerPoint (.pptx) leyendo su XML interno (son ZIP),
// sin librerías nuevas; texto plano, Markdown y CSV tal cual. El .doc viejo (binario) y otros formatos
// se suben igual pero sin texto: para esos, MarkItDown (instalado en la compu de Felipe) los pasa a
// .md con scripts/markitdown-carpeta.py y se sube ese .md.

export const TEXT_FORMATS = Object.freeze({
  pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', txt: 'Texto', md: 'Markdown (MarkItDown)', csv: 'CSV',
});
export const UPLOAD_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.md,.csv';

export const extensionOf = (name = '') => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
export const canExtractText = (name) => Object.hasOwn(TEXT_FORMATS, extensionOf(name));

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
};
export const contentTypeFor = (name) => CONTENT_TYPES[extensionOf(name)] || 'application/octet-stream';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// XML de Office -> texto: un renglón por párrafo/fila/celda, sin etiquetas.
export function xmlToText(xml = '') {
  return String(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/(w:p|a:p|row)>/g, '\n')
    .replace(/<\/(c|si)>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Lector mínimo de ZIP (directorio central) con DecompressionStream del navegador.
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipTextEntries(buffer, wanted = () => true) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error('No es un archivo de Office válido.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (content) entries.push({ name, text: decoder.decode(content) });
  }
  return entries;
}

const byNumber = (a, b) => Number(a.name.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.name.match(/(\d+)\.xml$/)?.[1] || 0);

export async function officeText(buffer, extension) {
  if (extension === 'docx') {
    const entries = await readZipTextEntries(buffer, (name) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name));
    const main = entries.filter((entry) => entry.name === 'word/document.xml');
    return [...main, ...entries.filter((entry) => entry.name !== 'word/document.xml')].map((entry) => xmlToText(entry.text)).filter(Boolean).join('\n\n');
  }
  if (extension === 'pptx') {
    const slides = await readZipTextEntries(buffer, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    return slides.sort(byNumber).map((slide, index) => `Diapositiva ${index + 1}\n${xmlToText(slide.text)}`).join('\n\n');
  }
  if (extension === 'xlsx') {
    // El texto de las celdas vive en sharedStrings; los números en cada hoja.
    const [shared] = await readZipTextEntries(buffer, (name) => name === 'xl/sharedStrings.xml');
    const strings = shared ? [...shared.text.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => xmlToText(match[1])) : [];
    const sheets = await readZipTextEntries(buffer, (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    return sheets.sort(byNumber).map((sheet) => [...sheet.text.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => [...row[1].matchAll(/<c([^>]*)>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g)]
      .map(([, attrs, value = '']) => (/t="s"/.test(attrs) ? strings[Number(value)] ?? '' : xmlToText(value))).filter(Boolean).join('\t')).filter(Boolean).join('\n')).join('\n\n');
  }
  return '';
}

// Devuelve el texto del archivo, o '' si el formato no se puede leer en el navegador.
export async function extractDocumentText(file) {
  const extension = extensionOf(file.name);
  if (extension === 'pdf') {
    const { extractPdfText } = await import('./pdf-text.js');
    return extractPdfText(file);
  }
  if (['txt', 'md', 'csv'].includes(extension)) return file.text();
  if (['docx', 'xlsx', 'pptx'].includes(extension)) return officeText(await file.arrayBuffer(), extension);
  return '';
}
