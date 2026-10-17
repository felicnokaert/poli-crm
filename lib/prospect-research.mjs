// Investigación dentro de la app, sin IA paga: (1) busca en la web páginas de
// empresas del rubro y la zona, (2) lee el sitio de cada candidata (respeta
// robots.txt) y (3) puntúa qué tan bien encaja con la familia, explicando por
// qué con frases y citas del propio sitio. Son reglas, no un modelo: el
// "razonamiento" es el detalle de qué señales se encontraron y cuáles faltan.
import { fetchPage, normalizeSiteUrl, robotsAllows, extractContacts } from './prospect-enrich.mjs';
import { COMPETITORS } from '../src/prospect-model.mjs';

const norm = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Señales por familia: lo que, si el sitio lo dice, indica que usa o vende el producto.
// `weight` pesa más lo que más confirma. `against` resta (revendedores, rubros que no son).
export const FAMILY_SIGNALS = {
  Penosil: {
    label: 'distribuidor ferretero',
    positive: [['espuma de poliuretano', 3], ['espuma poliuretano', 3], ['selladores', 2], ['sellador', 2], ['silicona', 1], ['adhesivos', 2], ['ferreteria', 2], ['corralon', 2], ['pintureria', 2], ['materiales de construccion', 2], ['sika', 2], ['fischer', 2], ['tekbond', 2], ['crossmaster', 2], ['sucursales', 1], ['tienda online', 1], ['distribuidor', 1]],
    against: [['clinica', 3], ['restaurante', 3], ['inmobiliaria', 3]],
  },
  Carrozados: {
    label: 'fabricante o carrocero que usa PRFV',
    positive: [['prfv', 4], ['fibra de vidrio', 4], ['plastico reforzado', 3], ['poliester reforzado', 3], ['laminado', 2], ['carrozado', 2], ['carroceria', 2], ['acoplado', 2], ['motorhome', 3], ['casilla rodante', 3], ['trailer', 2], ['furgon', 2], ['paneles', 1], ['monocasco', 3]],
    against: [['piscinas residenciales', 2], ['distribuidor de resinas', 3], ['venta de resinas', 3]],
  },
  Química: {
    label: 'industria que maneja tambores o IBC',
    positive: [['tambor', 3], ['tambores', 3], ['200 litros', 3], ['200 l', 2], ['ibc', 3], ['1000 litros', 3], ['envasado', 2], ['adhesivos', 2], ['pinturas', 2], ['lubricantes', 2], ['aceites', 1], ['miel', 2], ['quimica', 2], ['petroquimica', 3], ['resinas', 2], ['planta industrial', 1]],
    against: [['distribuidor de tambores', 2]],
  },
  Poliuretano: {
    label: 'usa o aplica poliuretano',
    positive: [['poliuretano', 4], ['espuma de poliuretano', 4], ['aislacion', 2], ['aplicador', 3], ['colchones', 2], ['tapiceria', 2], ['espumas', 2], ['impermeabilizacion', 2], ['proyectado', 3]],
    against: [],
  },
  PURMAC: {
    label: 'aplicador de poliuretano proyectado',
    positive: [['poliuretano proyectado', 5], ['poliuretano', 3], ['aislacion termica', 3], ['impermeabilizacion', 3], ['aplicador', 2], ['techos', 1], ['pintura industrial', 2]],
    against: [],
  },
  Poliurea: {
    label: 'aplicador de poliurea',
    positive: [['poliurea', 5], ['impermeabilizacion', 3], ['aplicador', 2], ['pintura industrial', 2], ['revestimiento', 2], ['piletas', 1]],
    against: [],
  },
  Resinplast: {
    label: 'trabaja con fibra de vidrio',
    positive: [['fibra de vidrio', 4], ['prfv', 4], ['poliester', 2], ['laminado', 2], ['astillero', 3], ['piscinas', 2], ['tanques', 2], ['resina', 2], ['embarcaciones', 2]],
    against: [],
  },
};

function signalsFor(family, rubros = []) {
  const known = FAMILY_SIGNALS[family];
  if (known) return known;
  return { label: `rubro afín a ${family}`, positive: rubros.map((item) => [norm(item), 3]), against: [] };
}

export function htmlToText(html = '') {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTitle(html = '') {
  return htmlToText((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

function snippetAround(text, keyword) {
  const index = norm(text).indexOf(keyword);
  if (index < 0) return '';
  const start = Math.max(0, index - 70);
  return `…${text.slice(start, index + keyword.length + 90).trim()}…`;
}

// Puntúa texto de un sitio contra la familia. Puro y testeado.
export function scoreAgainstFamily({ family, rubros = [], texts = [] }) {
  const book = signalsFor(family, rubros);
  const joined = texts.map((item) => item.text).join(' \n ');
  const plain = norm(joined);
  let points = 0;
  const hits = [];
  for (const [keyword, weight] of book.positive) {
    if (plain.includes(keyword)) {
      points += weight;
      const where = texts.find((item) => norm(item.text).includes(keyword));
      hits.push({ keyword, weight, url: where?.url || '', snippet: snippetAround(where?.text || joined, keyword) });
    }
  }
  const opposing = book.against.filter(([keyword]) => plain.includes(keyword));
  for (const [, weight] of opposing) points -= weight;
  const max = book.positive.slice().sort((a, b) => b[1] - a[1]).slice(0, 5).reduce((sum, [, w]) => sum + w, 0) || 1;
  const score = Math.max(0, Math.min(100, Math.round((points / max) * 100)));
  const competitors = COMPETITORS.filter((name) => plain.includes(norm(name)));
  const label = score >= 60 ? 'Encaja bien' : score >= 30 ? 'Encaja a medias' : 'Poca evidencia';
  const reasoning = [];
  if (hits.length) reasoning.push(`El sitio menciona ${hits.slice(0, 5).map((item) => `“${item.keyword}”`).join(', ')}, señales de que ${book.label}.`);
  else reasoning.push(`No se encontró en el sitio ninguna de las señales buscadas para ${family} (${book.label}).`);
  if (opposing.length) reasoning.push(`Resta: aparece ${opposing.map(([keyword]) => `“${keyword}”`).join(', ')}.`);
  if (competitors.length) reasoning.push(`Menciona competidores: ${competitors.join(', ')}. Puede comprar el producto, pero a otro proveedor.`);
  if (score < 30 && texts.length <= 1) reasoning.push('Se pudo leer poco del sitio (pocas páginas), así que el puntaje es incierto: conviene mirarlo a mano.');
  return { score, label, reasoning, evidence: hits.slice(0, 4), competitors };
}

const SKIP_HOSTS = /(^|\.)(facebook|instagram|linkedin|youtube|twitter|x|tiktok|mercadolibre|mercadopago|pinterest|wikipedia|google|bing|duckduckgo|yelp|tripadvisor|paginasamarillas|cylex|guialocal|olx|argenprop|zonaprop|computrabajo|bumeran|infobae|clarin|lanacion)\./i;

// Resultados de DuckDuckGo HTML: <a class="result__a" href="//duckduckgo.com/l/?uddg=URL...">Título</a>
export function parseDuckDuckGo(html = '') {
  const out = [];
  for (const match of String(html).matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = match[1].replace(/&amp;/g, '&');
    const wrapped = href.match(/[?&]uddg=([^&]+)/);
    if (wrapped) href = decodeURIComponent(wrapped[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    out.push({ url: href, title: htmlToText(match[2]) });
  }
  return out;
}

// Resultados de Bing: <li class="b_algo"><h2><a href="URL">Título</a></h2>
export function parseBing(html = '') {
  const out = [];
  for (const match of String(html).matchAll(/<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = unwrapBing(match[1].replace(/&amp;/g, '&'));
    if (/^https?:\/\//i.test(href)) out.push({ url: href, title: htmlToText(match[2]) });
  }
  return out;
}

// Bing envuelve los enlaces en bing.com/ck/a?...&u=a1<base64url de la dirección real>.
export function unwrapBing(href = '') {
  const wrapped = String(href).match(/^https?:\/\/(?:www\.)?bing\.com\/ck\/a\?.*[?&]u=a1([A-Za-z0-9_-]+)/);
  if (!wrapped) return href;
  try { return Buffer.from(wrapped[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return href; }
}

// Mojeek: <a class="ob" href="URL"> / <a class="title" href="URL">
export function parseMojeek(html = '') {
  const out = [];
  for (const match of String(html).matchAll(/<a[^>]+(?:class="[^"]*\b(?:ob|title)\b[^"]*"[^>]+href="([^"]+)"|href="([^"]+)"[^>]+class="[^"]*\b(?:ob|title)\b[^"]*")[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (match[1] || match[2] || '').replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(href)) out.push({ url: href, title: htmlToText(match[3]) });
  }
  return out;
}

export function usableCandidates(results = [], { limit = 15 } = {}) {
  const seen = new Set();
  const list = [];
  for (const item of results) {
    let url;
    try { url = new URL(item.url); } catch { continue; }
    const host = url.hostname.replace(/^www\./, '');
    if (SKIP_HOSTS.test(`${host}.`) || seen.has(host)) continue;
    seen.add(host);
    list.push({ title: item.title, website: `${url.protocol}//${url.hostname}`, host });
    if (list.length >= limit) break;
  }
  return list;
}

// Consultas por rubro y zona para la fase de descubrimiento.
export function buildQueries({ rubros = [], city = '', province = '', family = '' }) {
  const zone = [city, province].filter(Boolean).join(' ');
  const base = rubros.slice(0, 3);
  const queries = base.map((rubro) => `${rubro} ${zone}`.trim());
  if (family && FAMILY_SIGNALS[family]) queries.push(`${FAMILY_SIGNALS[family].positive[0][0]} ${zone}`.trim());
  return [...new Set(queries)].slice(0, 4);
}

export async function searchOnce(query, fetchFn, report) {
  const engines = [
    ['DuckDuckGo', `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=ar-es`, parseDuckDuckGo],
    ['Bing', `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=es-AR&cc=AR`, parseBing],
    ['Mojeek', `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, parseMojeek],
  ];
  for (const [name, url, parse] of engines) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const response = await fetchFn(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliplastCRM/1.0)', 'Accept-Language': 'es-AR,es;q=0.9' } });
      clearTimeout(timer);
      if (!response.ok) { report?.push(`${name}: HTTP ${response.status}`); continue; }
      const results = parse(await response.text());
      report?.push(`${name}: ${results.length} resultados`);
      if (results.length) return results;
    } catch { report?.push(`${name}: sin respuesta`); }
  }
  return [];
}

export async function discoverCandidates({ rubros, city, province, family }, { fetchFn = fetch } = {}) {
  const queries = buildQueries({ rubros, city, province, family });
  const report = [];
  const batches = await Promise.all(queries.map((query) => searchOnce(query, fetchFn, report)));
  const raw = batches.flat();
  const candidates = usableCandidates(raw);
  return { queries, candidates, searched: queries.length, answered: batches.filter((item) => item.length).length, rawResults: raw.length, engines: [...new Set(report)].slice(0, 12) };
}

const INTERNAL = /(productos|servicios|nosotros|empresa|quienes|catalogo|trabajos|aplicaciones|rubros|soluciones)/i;

function internalLinks(html, base) {
  const found = [];
  for (const match of String(html).matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      if (url.hostname === base.hostname && INTERNAL.test(url.pathname) && !found.includes(url.href)) found.push(url.href);
    } catch { /* enlace inválido */ }
  }
  return found.slice(0, 3);
}

// Lee el sitio (portada + hasta 3 páginas de productos/nosotros) y puntúa.
export async function researchWebsite({ website, family, rubros = [] }, deps = {}) {
  const base = normalizeSiteUrl(website);
  if (!base) return { ok: false, error: 'El sitio web no es una dirección válida.' };
  try {
    const robots = await fetchPage(new URL('/robots.txt', base), deps).catch(() => ({ ok: false }));
    const robotsText = robots.ok ? robots.text : '';
    if (robots.ok && !robotsAllows(robotsText, '/')) return { ok: true, blockedByRobots: true, score: 0, label: 'Sitio no consultable', reasoning: ['El sitio pide por robots.txt que no lo lea un programa. No se leyó.'], evidence: [], competitors: [], pages: [] };
    const home = await fetchPage(base, deps);
    if (!home.ok) return { ok: false, error: `El sitio respondió ${home.status}.` };
    const texts = [{ url: home.url.href, text: `${pageTitle(home.text)}. ${htmlToText(home.text)}` }];
    const contacts = extractContacts(home.text, home.url.href);
    for (const link of internalLinks(home.text, home.url)) {
      const path = new URL(link).pathname;
      if (robots.ok && !robotsAllows(robotsText, path)) continue;
      const page = await fetchPage(new URL(link), deps).catch(() => ({ ok: false }));
      if (page.ok) {
        texts.push({ url: page.url.href, text: htmlToText(page.text) });
        const more = extractContacts(page.text, page.url.href);
        for (const key of ['facebook', 'instagram', 'whatsapp']) if (!contacts[key]) contacts[key] = more[key];
        contacts.emails = [...new Set([...contacts.emails, ...more.emails])].slice(0, 3);
      }
    }
    const verdict = scoreAgainstFamily({ family, rubros, texts });
    return { ok: true, blockedByRobots: false, website: home.url.origin, pages: texts.map((item) => item.url), contacts, ...verdict };
  } catch (error) {
    if (error.name === 'AbortError') return { ok: false, error: 'El sitio tardó demasiado en responder.' };
    return { ok: false, error: error.message === 'Dirección no permitida.' ? error.message : 'No se pudo leer el sitio web.' };
  }
}
