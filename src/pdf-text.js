import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

function linesFromTextContent(items) {
  const rows = new Map();
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    const bucket = [...rows.keys()].find((key) => Math.abs(key - y) <= 2) ?? y;
    if (!rows.has(bucket)) rows.set(bucket, []);
    rows.get(bucket).push(item);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, rowItems]) => rowItems.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(' '));
}

// Extrae el texto de un PDF de factura, línea por línea, preservando el
// orden visual (por coordenadas) para que los renglones de ítems se puedan
// leer con expresiones regulares simples.
export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(linesFromTextContent(content.items).join('\n'));
  }
  return pages.join('\n');
}
