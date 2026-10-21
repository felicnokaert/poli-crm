// Clips de Mercado Libre (21/10): la API no deja leerlos, así que Felipe pega lo que ve en Mercado Libre
// (links, códigos MLA o títulos, uno por renglón) y se marcan las publicaciones que tienen clip.
import { plain } from './knowledge-search.mjs';

const flat = (text) => plain(text).replace(/[^a-z0-9]+/g, ' ').trim();

export function clipIdsFrom(text = '', items = []) {
  const ids = new Set();
  for (const match of String(text).matchAll(/MLA-?(\d{6,})/gi)) ids.add(`MLA${match[1]}`);
  const byTitle = new Map();
  for (const item of items) {
    const key = flat(item.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(item.id);
  }
  let titles = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const found = byTitle.get(flat(line));
    if (found) { titles += 1; found.forEach((id) => ids.add(id)); }
  }
  return { ids: [...ids], titles };
}
