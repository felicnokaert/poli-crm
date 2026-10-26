// "Contame todo de <cliente>" (22/10, Felipe: "le puse contame todo de lavopa y no me dio nada"): junta en
// una sola respuesta la ficha de la cartera (contacto, teléfono, CUIT, etapa, producto, última compra,
// próxima acción, notas). Las compras de Contabilium, tareas, ventas, historial y prospectos se suman con
// los otros bloques del asistente. Sin IA ni costo.
import { plain } from './knowledge-search.mjs';

const ASK = /\b(contame|conta|decime|hablame|todo (de|sobre|lo de)|info\w*|datos|ficha|resumen|quien es|que sabemos|que sabes|que hay de|novedades|el cliente|la empresa)\b/;
const FILLER = new Set(['contame', 'conta', 'decime', 'todo', 'toda', 'sobre', 'info', 'informacion', 'datos', 'dato', 'ficha', 'resumen', 'quien', 'que', 'sabemos', 'sabes', 'hablame', 'hay', 'del', 'los', 'las', 'cliente', 'empresa', 'novedades', 'con', 'para', 'por', 'una', 'uno', 'sus', 'mas', 'tenemos', 'tiene', 'lo']);

// "quien es la competencia en espuma" no es una ficha de cliente.
export const asksClient = (query) => ASK.test(plain(query)) && !/\b(competencia|competidor\w*|rivales?)\b/.test(plain(query));

export function clientWords(query) {
  return [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !FILLER.has(word)))].slice(0, 4);
}

// Clientes cuyo nombre (o contacto) tiene todas las palabras buscadas.
export function findClients(clients = [], query, { max = 3 } = {}) {
  const words = clientWords(query);
  if (!words.length) return [];
  return clients
    .filter((client) => client && !client.deleted && !client.deletedAt)
    .filter((client) => {
      const name = plain(`${client.company || ''} ${client.contact || ''}`);
      return words.every((word) => name.includes(word));
    })
    .slice(0, max);
}

// Si la pregunta nombra un cliente de la cartera (con "contame", "datos"… o solo el nombre), su ficha.
export function clientCards(clients = [], query) {
  const found = findClients(clients, query);
  if (!found.length) return [];
  // Solo el nombre ("lavopa") también vale, siempre que no sea una pregunta de producto.
  if (!asksClient(query) && clientWords(query).length > 2) return [];
  return found.map((client) => ({
    id: client.id || client.company,
    name: client.company,
    cuit: String(client.cuit || '').replace(/\D/g, '') || null,
    lines: [
      [client.contact && `Contacto: ${client.contact}`, client.phone && `Tel: ${client.phone}`, client.email && `Mail: ${client.email}`].filter(Boolean).join(' · '),
      [client.cuit && `CUIT: ${client.cuit}`, [client.city, client.province].filter(Boolean).join(', '), client.type, client.rubro].filter(Boolean).join(' · '),
      [client.stage && `Etapa: ${client.stage}`, client.mainProduct && `Producto principal: ${client.mainProduct}`, client.family && `Familia: ${client.family}`, client.lastPurchase && `Última compra anotada en la ficha (dato cargado a mano, puede estar viejo; la fecha real sale de los comprobantes de Contabilium): ${client.lastPurchase}`, client.lastQuotedAt && `Última cotización: ${String(client.lastQuotedAt).slice(0, 10).split('-').reverse().join('/')}`].filter(Boolean).join(' · '),
      client.nextAction && `Próxima acción: ${client.nextAction}${client.nextDate ? ` (${client.nextDate})` : ''}`,
      client.notes && `Notas: ${String(client.notes).slice(0, 400)}`,
    ].filter(Boolean),
  }));
}

// Palabras para buscar sus comprobantes en Contabilium: el nombre del cliente encontrado.
export function clientPurchaseWords(cards = []) {
  if (!cards.length) return [];
  return clientWords(cards[0].name).slice(0, 3);
}

export function clientContext(cards = []) {
  return cards.map((card) => [`Ficha del cliente ${card.name} (cartera del CRM):`, ...card.lines.map((line) => `- ${line}`)].join('\n')).join('\n');
}
