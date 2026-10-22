// Reglas de la empresa y aplicadores de la red RAPYP para el asistente (22/10, Felipe):
// - "cuando recomendamos algún aplicador, tenemos el mapa RAPYP: ofrecerle de ahí; si son muchos, ver quién
//   compra más y hace cuánto, para saber cuál recomendar y cuál es mejor cliente".
// - Nunca ofrecer ni recomendar a un competidor (Integral Buenos Aires es competidor directo).
// Las reglas viven en assistant_knowledge con producto "regla" (Felipe las edita desde la app).
import { plain } from './knowledge-search.mjs';
import { toMapClient } from './map-clients-adapter.mjs';

const ASK = /\b(aplicador\w*|aplica(r|dor|n)?|recomend\w*|rapyp|instalador\w*|quien (me )?(lo |la )?(aplica|hace|coloca|proyecta)|red de aplicadores|colocador\w*)\b/;
const ZONE_FILLER = new Set(['aplicador', 'aplicadores', 'recomendar', 'recomendame', 'recomenda', 'recomiendo', 'rapyp', 'quien', 'aplica', 'aplicar', 'cerca', 'zona', 'para', 'que', 'hay', 'tenemos', 'cliente', 'clientes', 'red', 'del', 'los', 'las', 'una', 'uno', 'con', 'por', 'mejor', 'mejores', 'espuma', 'poliuretano', 'poliurea', 'proyectado', 'proyectada', 'techo', 'techos', 'galpon', 'necesita', 'busca', 'buscando', 'alguien', 'instalador', 'instaladores', 'colocador']);

export const asksApplicators = (query) => ASK.test(plain(query));
export const isRule = (entry) => plain(entry?.product).trim() === 'regla';

const daysSince = (iso, today) => (iso ? Math.round((Date.parse(today) - Date.parse(iso)) / 86400000) : null);
const kgOf = (client) => (client.productos || []).reduce((sum, product) => sum + (Number(product.kg) || 0), 0);

// ¿Es un competidor? (nombre parecido a alguno de Academia → Competencia)
export function competitorNames(competitors = []) {
  return competitors.filter((rival) => rival?.kind !== 'cliente' && rival?.name).map((rival) => rival.name);
}
function looksLike(name, rivals) {
  const own = plain(name).replace(/[^a-z0-9 ]+/g, ' ').trim();
  return rivals.some((rival) => {
    const key = plain(rival).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(s ?r ?l|s ?a|srl|sa)\b/g, ' ').trim();
    return key.length >= 4 && (own.includes(key) || key.includes(own) && own.length >= 6);
  });
}

// Aplicadores RAPYP de la zona nombrada (o todos), del mejor cliente al peor: más kilos comprados y
// compra más reciente.
const PROVINCE_WORDS = new Set(['buenos', 'aires', 'caba', 'capital', 'catamarca', 'chaco', 'chubut', 'cordoba', 'corrientes', 'entre', 'rios', 'formosa', 'jujuy', 'pampa', 'rioja', 'mendoza', 'misiones', 'neuquen', 'negro', 'salta', 'juan', 'luis', 'santa', 'cruz', 'santiago', 'estero', 'tierra', 'fuego', 'tucuman', 'patagonia', 'cuyo', 'litoral', 'norte', 'noa', 'nea']);

export function rapypFor(clients = [], query, { competitors = [], today = new Date().toISOString().slice(0, 10), max = 8 } = {}) {
  if (!asksApplicators(query)) return null;
  const rivals = competitorNames(competitors);
  const zone = [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !ZONE_FILLER.has(word)))];
  const all = clients.map((client) => ({ crm: client, map: toMapClient(client) }))
    .filter(({ map }) => map && map.es_aplicador === 'si' && !looksLike(map.razon_social, rivals));
  // 22/10 (Felipe: "qué aplicadores me recomendás en X zona y de X provincia"): solo cuentan como lugar las
  // palabras que aparecen en la localidad o provincia de algún aplicador ("recomendás", "provincia"… no).
  const placeOf = ({ map }) => plain(`${map.localidad} ${map.provincia}`);
  const places = zone.filter((word) => all.some((row) => placeOf(row).includes(word)));
  // Si nombró una provincia y no hay aplicadores ahí, la lista queda vacía (no se ofrecen los de otro lado).
  const namedProvince = zone.some((word) => PROVINCE_WORDS.has(word));
  const inZone = places.length ? all.filter((row) => places.some((word) => placeOf(row).includes(word))) : namedProvince ? [] : all;
  const ranked = inZone
    .map(({ crm, map }) => ({ crm, map, kg: kgOf(map), days: daysSince(map.ultima_compra, today) }))
    .sort((a, b) => (a.days == null) - (b.days == null) || (b.kg - a.kg) || ((a.days ?? 1e9) - (b.days ?? 1e9)));
  return {
    zone: places.length ? places : namedProvince ? zone.filter((word) => PROVINCE_WORDS.has(word)) : [],
    total: inZone.length,
    list: ranked.slice(0, max).map(({ crm, map, kg, days }) => [
      map.razon_social,
      [map.localidad, map.provincia].filter(Boolean).join(', '),
      map.telefono && `tel ${map.telefono}`,
      days != null ? `última compra hace ${days} días` : 'sin compras registradas',
      map.n_facturas ? `${map.n_facturas} compras` : '',
      kg ? `${Math.round(kg).toLocaleString('es-AR')} kg` : '',
      crm.contact && `contacto ${crm.contact}`,
    ].filter(Boolean).join(' · ')),
  };
}

export function rulesContext({ rules = [], competitors = [], rapyp = null } = {}) {
  const lines = [];
  if (rules.length) lines.push('REGLAS DE LA EMPRESA (cumplilas siempre):', ...rules.map((rule) => `- ${rule.answer}`));
  const rivals = competitorNames(competitors);
  if (rivals.length) lines.push(`Competidores (nunca ofrecerles nada ni recomendarlos): ${rivals.slice(0, 80).join(', ')}.`);
  if (rapyp) {
    lines.push(rapyp.list.length
      ? `Aplicadores de la red RAPYP${rapyp.zone.length ? ` en ${rapyp.zone.join(' ')}` : ''} (${rapyp.total}; ordenados del mejor cliente: más kilos comprados y compra más reciente):`
      : `No hay aplicadores RAPYP cargados${rapyp.zone.length ? ` en ${rapyp.zone.join(' ')}` : ''}: sugerí consultar con Juan o David.`);
    lines.push(...rapyp.list.map((line) => `- ${line}`));
  }
  return lines.join('\n');
}
