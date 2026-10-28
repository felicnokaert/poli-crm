// Reglas de Felipe para las descripciones de Shopify (26/10 y 28/10):
//  - La descripción es SOLO la presentación, corta. Características, Áreas de aplicación, Instrucciones de uso y Limitaciones y consejos van en
//    metacampos custom.* (caracteristicas, areas_de_aplicacion, instrucciones_de_uso, limitaciones_y_consejos-).
//  - Especificaciones técnicas, Medidas, Material, Colores, Beneficios… siguen en la descripción hasta que Felipe diga dónde van.
//  - Ningún producto con variantes dice cuántas unidades trae (el cliente elige la variante: 3, 6, 12, 24).
// Puro y sin red: parte el texto de una publicación de Mercado Libre para armar el borrador.
const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SECTIONS = [
  { key: 'caracteristicas', type: 'list', test: /^(caracteristicas( principales)?|ventajas)$/ },
  { key: 'areas_de_aplicacion', type: 'list', test: /^(areas? de aplicacion|campos? de aplicacion|aplicaciones|usos( recomendados)?)$/ },
  { key: 'instrucciones_de_uso', type: 'text', test: /^(instrucciones( de uso)?|modo de uso|modo de empleo|como (se )?usar(lo)?|forma de uso)$/ },
  { key: 'limitaciones_y_consejos-', type: 'list', test: /^(limitaciones( y consejos)?|consejos( de uso)?|precauciones|recomendaciones( de uso)?)$/ },
];

const headingText = (line) => plain(line.replace(/:\s*$/, ''));
const sectionOf = (line) => {
  const raw = line.trim();
  if (!raw || raw.length > 60) return null;
  const text = headingText(raw);
  return SECTIONS.find((section) => section.test.test(text)) || null;
};
// Un título que no reconocemos (Especificaciones técnicas, Beneficios…): corta la sección anterior y queda en la descripción.
const looksLikeHeading = (line) => {
  const raw = line.trim();
  if (!raw || raw.length > 45) return false;
  if (/:\s*$/.test(raw)) return true;
  const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase();
};
const bullet = (line) => line.replace(/^\s*(?:[-•*▪●✔✓]+|\d+[.)])\s*/, '').trim();

// Parte el texto en { presentation, kept, sections }. sections trae solo lo que se encontró.
export function splitSections(text = '') {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const intro = [];
  const kept = [];
  const found = {};
  let current = null; // sección reconocida abierta
  let afterOther = false; // pasó un título desconocido: lo que sigue se queda en la descripción
  for (const line of lines) {
    const section = sectionOf(line);
    if (section) { current = section; found[section.key] = found[section.key] || []; afterOther = false; continue; }
    if (current && !afterOther && looksLikeHeading(line)) { current = null; afterOther = true; kept.push(line); continue; }
    if (current) { const item = bullet(line); if (item) found[current.key].push(item); continue; }
    if (afterOther || kept.length) kept.push(line);
    else if (looksLikeHeading(line) && intro.some((row) => row.trim())) { afterOther = true; kept.push(line); }
    else intro.push(line);
  }
  const join = (rows) => rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const sections = {};
  for (const section of SECTIONS) {
    const items = found[section.key];
    if (items && items.length) sections[section.key] = section.type === 'text' ? items.join('\n') : items;
  }
  return { presentation: join(intro), kept: join(kept), sections };
}

// Metacampos listos para el borrador: { key, type, value }. Las listas van como JSON (list.single_line_text_field).
export function sectionMetafields(sections = {}) {
  const out = [];
  for (const section of SECTIONS) {
    const value = sections[section.key];
    if (!value || !value.length) continue;
    if (section.type === 'text') out.push({ key: section.key, type: 'multi_line_text_field', value: String(value).slice(0, 5000) });
    else out.push({ key: section.key, type: 'list.single_line_text_field', value: JSON.stringify(value.map((item) => String(item).slice(0, 255)).slice(0, 25)) });
  }
  return out;
}

// Saca las cantidades de un texto (título, descripción o "Incluye:") cuando el producto tiene variantes por cantidad.
export function stripQuantities(text = '') {
  return String(text || '')
    .split('\n')
    .filter((line) => !/(?<![\p{L}])(?:eleg[ií]|elija|seleccion[aá]|escog[eé])(?![\p{L}]).*\d+.*unidades?/iu.test(line))
    .map((line) => line
      .replace(/\b(?:pack|kit|caja|combo|set)\s+(?:de|x)\s*\d+(?:\s*(?:unidades|unid\.?|u\.?))?/gi, (match) => match.replace(/\s*(?:de|x)\s*\d+(?:\s*(?:unidades|unid\.?|u\.?))?/i, ''))
      .replace(/(^|\n)(\s*[-•*]\s*)\d+\s*x?\s+(?=\p{L})/gu, '$1$2')
      .replace(/\bx\s?\d+\b/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
