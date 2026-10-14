// Enriquecimiento de prospectos desde el sitio web de la propia empresa:
// redes (Facebook, Instagram), WhatsApp y mail que ella publica. Respeta
// robots.txt, se identifica con un User-Agent propio, limita tamaño, tiempo y
// redirecciones, y rechaza direcciones privadas (SSRF). NO entra a Instagram
// ni a Facebook: solo lee el HTML del sitio de la empresa.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { possibleWhatsAppLink } from '../src/prospect-model.mjs';

export const ENRICH_USER_AGENT = 'PoliplastCRM-Prospeccion/1.0 (+https://poli-crm.vercel.app; contacto comercial; respeta robots.txt)';
const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;
const CONTACT_PATHS = ['/contacto', '/contact', '/contactanos'];

function privateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) return privateIPv4(ip);
  const text = ip.toLowerCase();
  if (text === '::1' || text === '::') return true;
  const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIPv4(mapped[1]);
  return /^(fc|fd|fe[89ab])/.test(text);
}

export function normalizeSiteUrl(value = '') {
  const text = String(value).trim();
  if (!text || (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text))) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

// Falla con un Error claro si el host apunta a una red privada.
export async function assertPublicHost(url, lookup = dnsLookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Dirección no permitida.');
    return;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Dirección no permitida.');
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((item) => isPrivateAddress(item.address))) throw new Error('Dirección no permitida.');
}

// Reglas de robots.txt para nuestro agente (o "*"): devuelve si se puede leer `path`.
export function robotsAllows(robotsText = '', path = '/') {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(robotsText).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const mine = groups.filter((group) => group.agents.some((agent) => agent && 'poliplastcrm-prospeccion'.includes(agent) && agent !== '*'));
  const chosen = mine.length ? mine : groups.filter((group) => group.agents.includes('*'));
  let verdict = true;
  let longest = -1;
  for (const group of chosen) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
      if (new RegExp(`^${pattern}`).test(path) && rule.path.length > longest) {
        longest = rule.path.length;
        verdict = rule.allow;
      }
    }
  }
  return verdict;
}

async function readLimited(response, maxBytes) {
  if (!response.body?.getReader) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try { await reader.cancel(); } catch { /* ya terminó */ }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((item) => Buffer.from(item))).subarray(0, maxBytes));
}

// GET con redirecciones manuales: cada salto se revalida contra la red privada.
export async function fetchPage(startUrl, { fetchFn = fetch, lookup = dnsLookup, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url, lookup);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url.href, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': ENRICH_USER_AGENT, Accept: 'text/html,text/plain;q=0.9' } });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        url = new URL(response.headers.get('location'), url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Redirección no permitida.');
        continue;
      }
      if (!response.ok) return { ok: false, status: response.status, url };
      const type = response.headers.get('content-type') || '';
      if (type && !/text\/|html|xml/i.test(type)) return { ok: false, status: 415, url };
      return { ok: true, status: response.status, url, text: await readLimited(response, maxBytes) };
    } finally { clearTimeout(timer); }
  }
  return { ok: false, status: 310, url };
}

const SOCIAL_SKIP_FB = new Set(['sharer', 'sharer.php', 'share.php', 'share', 'plugins', 'tr', 'dialog', 'login', 'login.php', 'policies', 'help', 'groups', 'events', 'watch', 'marketplace', 'pages', 'privacy', 'legal', 'about', 'ads', 'business', 'l.php', 'hashtag', 'photo', 'photo.php', 'permalink.php', 'story.php', 'reel', 'reels', 'videos', 'people', 'gaming', 'stories']);
const SOCIAL_SKIP_IG = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'tv', 'stories', 'share', 'directory', 'about', 'legal', 'developer', 'web', 'direct', 'oauth']);

function hrefs(html) {
  return [...String(html).matchAll(/(?:href|content)\s*=\s*["']([^"']+)["']/gi)].map((item) => item[1].replace(/&amp;/g, '&').trim());
}

function profileOf(href, hostPattern, skip, { allowProfileId = false } = {}) {
  let url;
  try { url = new URL(href.startsWith('//') ? `https:${href}` : href); } catch { return ''; }
  if (!hostPattern.test(url.hostname)) return '';
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) return '';
  if (allowProfileId && parts[0] === 'profile.php' && url.searchParams.get('id')) return `https://www.facebook.com/profile.php?id=${url.searchParams.get('id')}`;
  const name = parts[0];
  if (skip.has(name.toLowerCase()) || !/^[A-Za-z0-9._-]{3,}$/.test(name)) return '';
  const host = hostPattern.source.includes('instagram') ? 'www.instagram.com' : 'www.facebook.com';
  return `https://${host}/${name}`;
}

const BAD_EMAIL_DOMAINS = /(^|\.)(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|example\.com|domain\.com|email\.com|godaddy\.com)$/i;

export function extractContacts(html = '', baseUrl = '') {
  const links = hrefs(html);
  let facebook = '';
  let instagram = '';
  const whatsappNumbers = [];
  const emails = [];
  for (const href of links) {
    if (!facebook) facebook = profileOf(href, /(^|\.)facebook\.com$/i, SOCIAL_SKIP_FB, { allowProfileId: true });
    if (!instagram) instagram = profileOf(href, /(^|\.)instagram\.com$/i, SOCIAL_SKIP_IG);
    const wa = href.match(/^https?:\/\/wa\.me\/(?:message\/)?\+?(\d{8,15})/i)
      || href.match(/^https?:\/\/(?:api|web)\.whatsapp\.com\/send\/?\?(?:[^"']*&)?phone=\+?(\d{8,15})/i)
      || href.match(/^whatsapp:\/\/send\?(?:[^"']*&)?phone=\+?(\d{8,15})/i);
    if (wa) whatsappNumbers.push(wa[1]);
    const mail = href.match(/^mailto:([^?\s]+)/i);
    if (mail) emails.push(decodeURIComponent(mail[1]).toLowerCase());
  }
  for (const found of String(html).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.push(found[0].toLowerCase());
  let siteHost = '';
  try { siteHost = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { /* sin base */ }
  const cleanEmails = [...new Set(emails)]
    .filter((item) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(item) && !BAD_EMAIL_DOMAINS.test(item.split('@')[1] || ''))
    .sort((a, b) => Number(b.endsWith(`@${siteHost}`)) - Number(a.endsWith(`@${siteHost}`)));
  const number = whatsappNumbers[0] || '';
  return {
    facebook,
    instagram,
    // Solo se arma el link si es un celular argentino (+54 9...). Siempre "posible".
    whatsapp: number ? { number, link: possibleWhatsAppLink(number), possible: true } : null,
    emails: cleanEmails.slice(0, 3),
  };
}

function merge(into, from) {
  if (!into.facebook) into.facebook = from.facebook;
  if (!into.instagram) into.instagram = from.instagram;
  if (!into.whatsapp) into.whatsapp = from.whatsapp;
  into.emails = [...new Set([...into.emails, ...from.emails])].slice(0, 3);
}

// Lee la portada (y /contacto si falta algo) y devuelve lo que la empresa publica.
export async function enrichWebsite(website, deps = {}) {
  const base = normalizeSiteUrl(website);
  if (!base) return { ok: false, error: 'El sitio web no es una dirección válida.' };
  if (/(^|\.)(facebook|instagram|wa\.me|linktr\.ee|mercadolibre)\./i.test(base.hostname)) return { ok: false, error: 'Ese enlace es una red o un marketplace, no el sitio propio de la empresa.' };
  const fetchFn = deps.fetchFn || fetch;
  try {
    await assertPublicHost(base, deps.lookup);
    const robots = await fetchPage(new URL('/robots.txt', base), deps).catch(() => ({ ok: false }));
    const robotsText = robots.ok ? robots.text : '';
    if (robots.ok && !robotsAllows(robotsText, '/')) return { ok: true, blockedByRobots: true, pages: [], facebook: '', instagram: '', whatsapp: null, emails: [] };
    const found = { facebook: '', instagram: '', whatsapp: null, emails: [] };
    const pages = [];
    const home = await fetchPage(base, { ...deps, fetchFn });
    if (!home.ok) return { ok: false, error: `El sitio respondió ${home.status}.` };
    pages.push(home.url.href);
    merge(found, extractContacts(home.text, home.url.href));
    const complete = () => found.facebook && found.instagram && found.whatsapp && found.emails.length;
    for (const path of CONTACT_PATHS) {
      if (complete() || pages.length >= 2) break;
      if (robots.ok && !robotsAllows(robotsText, path)) continue;
      const page = await fetchPage(new URL(path, home.url), { ...deps, fetchFn }).catch(() => ({ ok: false }));
      if (page.ok) { pages.push(page.url.href); merge(found, extractContacts(page.text, page.url.href)); }
    }
    return { ok: true, blockedByRobots: false, pages, ...found };
  } catch (error) {
    if (error.name === 'AbortError') return { ok: false, error: 'El sitio tardó demasiado en responder.' };
    return { ok: false, error: error.message === 'Dirección no permitida.' ? error.message : 'No se pudo leer el sitio web.' };
  }
}
