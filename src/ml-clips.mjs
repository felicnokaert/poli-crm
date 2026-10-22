// Clips de Mercado Libre (21/10): la API no deja leerlos, así que Felipe pega lo que ve en Mercado Libre
// (links, códigos MLA o títulos, uno por renglón) y se marcan las publicaciones que tienen clip.
// 22/10: también páginas enteras copiadas del listado de Publicaciones (código "#2212937382" y el título
// con precio y stock en el mismo renglón).
import { plain } from './knowledge-search.mjs';

const flat = (text) => plain(text).replace(/[^a-z0-9]+/g, ' ').trim();

export function clipIdsFrom(text = '', items = []) {
  const ids = new Set();
  for (const match of String(text).matchAll(/MLA-?(\d{6,})/gi)) ids.add(`MLA${match[1]}`);
  for (const match of String(text).matchAll(/#\s?(\d{9,12})\b/g)) ids.add(`MLA${match[1]}`);
  const byTitle = new Map();
  for (const item of items) {
    const key = flat(item.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(item.id);
  }
  // Título exacto, o renglón que empieza con el título (los más largos primero).
  const known = [...byTitle.keys()].filter((key) => key.length >= 12).sort((a, b) => b.length - a.length);
  let titles = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const key = flat(line);
    if (!key) continue;
    const exact = byTitle.get(key);
    const prefix = exact ? null : known.find((title) => key.startsWith(title));
    const found = exact || (prefix && byTitle.get(prefix));
    if (found) { titles += 1; found.forEach((id) => ids.add(id)); }
  }
  return { ids: [...ids], titles };
}
