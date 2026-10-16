// Lo que se saca de las fichas técnicas para mostrar de un vistazo (puro, sin base).
//  - keyFacts: los datos clave de una ficha (temperatura, rendimiento, densidad...) con sus líneas literales.
//  - clientSuggestions: qué fichas le sirven a una empresa (las de lo que ya compra y las que encajan con
//    su rubro), para "Qué le conviene" en la ficha del cliente.
import { extractLines, recommendDocuments, TOPICS } from './product-answer.mjs';
import { needsSheet, productKeys, sheetsFor } from './product-coverage.mjs';
import { plain } from './knowledge-search.mjs';

const KEY_TOPICS = ['temperatura', 'rendimiento', 'densidad', 'tiempos', 'mezcla', 'almacenamiento', 'presentacion'];

// Cada renglón va a un solo dato: primero los temas más específicos (una densidad en kg/m³ no es
// "rendimiento"; "almacenar a 15-25 °C" es almacenamiento, no temperatura de trabajo).
const CLAIM_ORDER = ['densidad', 'almacenamiento', 'tiempos', 'mezcla', 'temperatura', 'rendimiento', 'presentacion'];

export function keyFacts(doc = {}, perTopic = 2) {
  const text = doc.extractedText || doc.extracted_text || '';
  if (!text) return [];
  const used = new Set();
  const byKey = {};
  for (const key of CLAIM_ORDER) {
    byKey[key] = extractLines(text, [key], perTopic + 4).filter((line) => !used.has(line)).slice(0, perTopic);
    byKey[key].forEach((line) => used.add(line));
  }
  return KEY_TOPICS.map((key) => {
    const label = TOPICS.find(([topic]) => topic === key)?.[1] || key;
    return { key, label, lines: byKey[key] };
  }).filter((fact) => fact.lines.length);
}

// Filtros de calidad de la lista de Base técnica.
export const QUALITY_FILTERS = {
  all: ['Todos', () => true],
  sinTexto: ['Sin texto (el copiloto no los lee)', (doc) => !String(doc.extractedText || '').trim()],
  sinArchivo: ['Sin archivo adjunto', (doc) => !doc.storagePath],
  sinVincular: ['Sin vincular a un producto', (doc, linkedIds) => !linkedIds.has(doc.id)],
  pendientes: ['Sin validar todavía', (doc) => doc.status !== 'vigente'],
};

export function matchesSearch(doc = {}, query = '') {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = plain([doc.title, doc.product, doc.sku, doc.family, doc.sourceFile].filter(Boolean).join(' '));
  return words.every((word) => text.includes(word));
}

// Qué le conviene a una empresa: fichas de los productos que ya compra (por su código o nombre) y fichas
// que encajan con su familia y rubro. Sin inventar: solo fichas cargadas en Base técnica.
export function clientSuggestions(client = {}, docs = [], alsoBought = []) {
  const bought = [...new Set([...(client.polio8?.products || []).map((product) => product?.name), ...alsoBought].filter(Boolean))];
  const own = [];
  const seen = new Set();
  for (const name of bought) {
    for (const doc of sheetsFor({ id: '', name }, docs, [])) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      own.push({ doc, because: `compra ${name}` });
    }
  }
  const profile = [client.family, client.industry, client.clientType, client.mainProduct, client.rubro, client.notes]
    .filter((value) => value && !/^(sin definir|desconocid|a confirmar)/i.test(String(value))).join(' ');
  const related = profile
    ? recommendDocuments(profile, docs.filter((doc) => !seen.has(doc.id)), 4).map(({ doc, covered, total }) => ({ doc, because: `su ficha nombra ${covered.length} de ${total} cosas de su rubro y producto principal` }))
    : [];
  return { own: own.slice(0, 5), related, boughtCount: bought.length, codes: bought.flatMap((name) => productKeys({ name }).codes) };
}

// Qué productos del catálogo usan cada ficha (vínculo a mano o porque la ficha los nombra): id de ficha → productos.
export function docProductMap(products = [], docs = [], links = []) {
  const map = new Map();
  for (const product of products) {
    if (!needsSheet(product)) continue;
    for (const doc of sheetsFor(product, docs, links)) {
      if (!map.has(doc.id)) map.set(doc.id, []);
      map.get(doc.id).push(product);
    }
  }
  return map;
}
