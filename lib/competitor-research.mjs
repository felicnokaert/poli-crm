// Ficha de competidor armada al instante, sin IA paga (Felipe 17/10: "cuando cargo el nombre y el link, lo
// ideal es que arranque la investigación y me deje todo anotado, no que diga 'en proceso'").
// Lee el sitio de la empresa con las mismas piezas que Prospección (respeta robots.txt, tiempo y tamaño
// limitados, sin direcciones privadas) y anota solo lo que el sitio dice, con la página de donde salió.
// Si no hay link, busca el sitio por el nombre. Nada se completa por suposición.
import { fetchPage, normalizeSiteUrl, robotsAllows, extractContacts } from './prospect-enrich.mjs';
import { htmlToText, searchOnce, usableCandidates } from './prospect-research.mjs';

const norm = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Productos y rubros que interesan a Poliplast: si el sitio los menciona, van a "Productos".
export const PRODUCT_WORDS = [
  ['poliuretano proyectado', 'Poliuretano proyectado'], ['espuma de poliuretano', 'Espuma de poliuretano'],
  ['sistemas de poliuretano', 'Sistemas de poliuretano'], ['poliuretano', 'Poliuretano'], ['poliurea', 'Poliurea'],
  ['poliisocianurato', 'Poliisocianurato (PIR)'], ['paneles', 'Paneles'], ['planchas', 'Planchas'],
  ['aislacion termica', 'Aislación térmica'], ['impermeabiliz', 'Impermeabilización'],
  ['fibra de vidrio', 'Fibra de vidrio'], ['prfv', 'PRFV'], ['resina', 'Resinas'], ['gel coat', 'Gel coat'], ['gelcoat', 'Gel coat'],
  ['sellador', 'Selladores'], ['silicona', 'Siliconas'], ['adhesivo', 'Adhesivos'], ['aerosol', 'Aerosoles'],
  ['maquina', 'Máquinas'], ['equipos de proyeccion', 'Equipos de proyección'], ['repuesto', 'Repuestos'],
  ['isocianato', 'Isocianato'], ['poliol', 'Poliol'], ['colchon', 'Colchones'], ['carroceria', 'Carrocerías'],
];

const INTERNAL = /(productos|servicios|nosotros|empresa|quienes|catalogo|soluciones|contacto)/i;

function metaContent(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const found = String(html).match(re);
  return htmlToText(found ? found[1] || found[2] : '');
}

function titleOf(html) {
  return htmlToText((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

function phonesOf(html) {
  const out = [];
  for (const match of String(html).matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    const phone = decodeURIComponent(match[1]).replace(/[^\d+]/g, '');
    const tail = phone.replace(/\D/g, '').slice(-8);
    if (tail.length >= 8 && !out.some((item) => item.replace(/\D/g, '').endsWith(tail))) out.push(phone);
  }
  return out.slice(0, 2);
}

// Domicilio publicado (schema.org o un texto "Dirección: …"). Si no hay, queda vacío.
function addressOf(html, text) {
  const street = String(html).match(/"streetAddress"\s*:\s*"([^"]{4,120})"/i);
  const city = String(html).match(/"addressLocality"\s*:\s*"([^"]{2,60})"/i);
  if (street || city) return [street?.[1], city?.[1]].filter(Boolean).join(', ');
  const plain = String(text).match(/(?:direcci[oó]n|domicilio)\s*:\s*(.{8,120}?)(?=\s+(?:tel[eé]fono|tel\.|e-?mail|mail|whatsapp|horario|lunes|cp\b|c\.p\.)|\s*[|•]|$)/i);
  if (!plain) return '';
  const value = plain[1].trim().replace(/[,;:\-–]+$/, '');
  return /\d/.test(value) ? value.slice(0, 100) : '';
}

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

// Con qué familias de Poliplast compite, según los productos que menciona su sitio.
const FAMILY_BY_PRODUCT = [
  ['Poliuretano', ['Sistemas de poliuretano', 'Poliuretano', 'Espuma de poliuretano', 'Isocianato', 'Poliol', 'Poliisocianurato (PIR)']],
  ['PURMAC', ['Poliuretano proyectado', 'Equipos de proyección']],
  ['Poliurea', ['Poliurea']],
  ['Planchas', ['Planchas', 'Paneles']],
  ['Resinplast', ['Fibra de vidrio', 'PRFV', 'Resinas', 'Gel coat']],
  ['Penosil', ['Selladores', 'Siliconas', 'Aerosoles']],
];
export function familiesFor(products = [], all = '') {
  const out = FAMILY_BY_PRODUCT.filter(([, list]) => list.some((item) => products.includes(item))).map(([key]) => key);
  if (products.includes('Máquinas') && /poliuretano|poliurea/.test(all) && !out.includes('PURMAC')) out.push('PURMAC');
  if (/carroceria|carrozad|furgon/.test(all) && /(fibra de vidrio|prfv|poliuretano)/.test(all)) out.push('Carrozados');
  return out;
}

// Arma la ficha con lo leído. Puro y testeado: recibe las páginas ya descargadas.
export function buildCompetitorFromPages({ name, website, family = '', kind = '', pages = [], foundByName = false, now = new Date() }) {
  const home = pages[0] || { url: website, html: '' };
  const texts = pages.map((page) => ({ url: page.url, text: `${titleOf(page.html)}. ${htmlToText(page.html)}` }));
  const description = metaContent(home.html, 'description') || metaContent(home.html, 'og:description');
  if (description && texts[0]) texts[0].text = `${description}. ${texts[0].text}`;
  const all = norm(texts.map((item) => item.text).join(' '));
  const title = titleOf(home.html);
  const summary = description ? `Según su sitio: "${description.slice(0, 280)}"` : title ? `Su sitio se presenta como: "${title.slice(0, 160)}"` : '';
  const products = [...new Set(PRODUCT_WORDS.filter(([word]) => all.includes(word)).map(([, label]) => label))].slice(0, 10);
  const families = familiesFor(products, all);
  if (family && !families.includes(family)) families.unshift(family);
  const contacts = { emails: [], phones: [], facebook: '', instagram: '', whatsapp: null };
  for (const page of pages) {
    const found = extractContacts(page.html, page.url);
    contacts.emails = [...new Set([...contacts.emails, ...found.emails])].slice(0, 2);
    contacts.phones = [...new Set([...contacts.phones, ...phonesOf(page.html)])].slice(0, 2);
    for (const key of ['facebook', 'instagram', 'whatsapp']) if (!contacts[key]) contacts[key] = found[key];
  }
  const location = pages.map((page, index) => addressOf(page.html, texts[index].text)).find(Boolean) || '';
  const channels = [
    contacts.phones.length ? `Tel. ${contacts.phones.join(' / ')}` : '',
    contacts.emails.length ? contacts.emails.join(', ') : '',
    contacts.whatsapp ? `WhatsApp ${contacts.whatsapp.number}` : '',
    contacts.instagram ? 'Instagram' : '', contacts.facebook ? 'Facebook' : '',
    /tienda online|carrito|comprar online|agregar al carrito/.test(all) ? 'Tienda online' : '',
    /mercadolibre/.test(all) ? 'Mercado Libre' : '',
    /distribuidor|revendedor/.test(all) ? 'Trabaja con distribuidores' : '',
  ].filter(Boolean).join(' · ');
  const guessedKind = kind || (/(fabricamos|fabricante|planta industrial|nuestra planta)/.test(all) ? 'fabricante' : /(maquinas|equipos de proyeccion)/.test(all) ? 'equipos' : /(distribuidor|distribuimos|representante)/.test(all) ? 'distribuidor' : 'fabricante');
  const day = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
  const sources = [
    ...pages.map((page, index) => ({ t: index === 0 ? 'Sitio oficial' : (titleOf(page.html) || new URL(page.url).pathname).slice(0, 60), u: page.url })),
    ...(contacts.instagram ? [{ t: 'Instagram', u: contacts.instagram }] : []),
    ...(contacts.facebook ? [{ t: 'Facebook', u: contacts.facebook }] : []),
  ];
  const missing = [!summary && 'descripción', !products.length && 'productos', !location && 'dirección', !channels && 'contacto'].filter(Boolean);
  let host = '';
  try { host = new URL(website).hostname; } catch { /* sin sitio */ }
  const argentine = /\.ar$/.test(host) || /argentina|buenos aires|cordoba|rosario|santa fe|mendoza/.test(all) || contacts.phones.some((phone) => phone.startsWith('+54')) || Boolean(contacts.whatsapp?.number?.startsWith('54'));
  const warnings = [
    foundByName ? `El sitio (${host}) se encontró buscando el nombre: confirmá que sea la empresa correcta.` : '',
    argentine ? '' : 'Ojo: el sitio no muestra señales de Argentina; puede ser otra empresa con el mismo nombre.',
  ].filter(Boolean).join(' ');
  return {
    name, kind: guessedKind, families, summary, products, location, website: website || '', channels, sources,
    caveats: `${warnings ? `${warnings} ` : ''}Ficha armada automáticamente leyendo su sitio el ${day} (${pages.length} página${pages.length === 1 ? '' : 's'}). Falta revisarla.${missing.length ? ` El sitio no dice: ${missing.join(', ')}.` : ''} Sin precios.`,
  };
}

// Busca el sitio propio por el nombre: el primer resultado cuyo dominio o título se parezca al nombre.
export async function findWebsiteByName(name, { fetchFn = fetch } = {}) {
  const words = norm(name).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !['srl', 'sa', 'sociedad'].includes(word));
  if (!words.length) return '';
  const found = usableCandidates(await searchOnce(`${name} Argentina`, fetchFn, []), { limit: 8 });
  const results = [...found.filter((item) => /\.ar$/.test(item.host)), ...found.filter((item) => !/\.ar$/.test(item.host))];
  const squashed = words.join('');
  const hit = results.find((item) => norm(item.host).replace(/[^a-z0-9]/g, '').includes(squashed))
    || results.find((item) => words.every((word) => norm(`${item.title} ${item.host}`).includes(word)));
  return hit ? hit.website : '';
}

export async function researchCompetitor({ name = '', website = '', family = '', kind = '' }, deps = {}) {
  const cleanName = String(name).trim().slice(0, 120);
  let site = String(website || '').trim();
  if (/facebook\.|instagram\.|wa\.me|linktr\.ee|mercadolibre\./i.test(site)) site = '';
  const foundByName = !site;
  if (!site && cleanName) site = await findWebsiteByName(cleanName, deps).catch(() => '');
  const base = normalizeSiteUrl(site);
  if (!base) return { ok: false, reason: 'sin-sitio', error: site ? 'El link no es una dirección válida.' : 'No encontramos el sitio de la empresa con ese nombre. Cargá el link de su página web.' };
  try {
    const robots = await fetchPage(new URL('/robots.txt', base), deps).catch(() => ({ ok: false }));
    const robotsText = robots.ok ? robots.text : '';
    if (robots.ok && !robotsAllows(robotsText, '/')) return { ok: false, reason: 'robots', error: 'Ese sitio pide que no lo lea un programa, así que no se leyó. Cargalo a mano.' };
    // Portada con más paciencia (hay sitios lentos) y un segundo intento; las internas, todas a la vez.
    const home = await fetchPage(base, { timeoutMs: 12000, ...deps }).catch(() => fetchPage(base, { timeoutMs: 12000, ...deps }));
    if (!home.ok) return { ok: false, reason: 'sitio', error: `El sitio respondió ${home.status}.` };
    const links = internalLinks(home.text, home.url).filter((link) => !robots.ok || robotsAllows(robotsText, new URL(link).pathname));
    const inner = await Promise.all(links.map((link) => fetchPage(new URL(link), deps).catch(() => ({ ok: false }))));
    const pages = [{ url: home.url.href, html: home.text }, ...inner.filter((page) => page.ok).map((page) => ({ url: page.url.href, html: page.text }))];
    const label = cleanName || titleOf(home.text).split(/[|\-–]/)[0].trim() || home.url.hostname.replace(/^www\./, '');
    return { ok: true, competitor: buildCompetitorFromPages({ name: label, website: home.url.origin, family, kind, pages, foundByName }) };
  } catch (error) {
    if (error.name === 'AbortError') return { ok: false, reason: 'sitio', error: 'El sitio tardó demasiado en responder.' };
    return { ok: false, reason: 'sitio', error: error.message === 'Dirección no permitida.' ? error.message : 'No se pudo leer el sitio web.' };
  }
}
