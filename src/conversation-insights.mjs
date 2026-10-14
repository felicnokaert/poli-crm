// Lectura automática de una conversación de WhatsApp, SIN IA paga: reglas de
// texto en el navegador. Devuelve resumen, ánimo del cliente, nota de 1 a 10
// de "qué tan listo está para comprar", competidores mencionados y próximo
// paso sugerido. Son heurísticas: orientan, no reemplazan leer el chat.
import { COMPETITORS } from './prospect-model.mjs';

function plain(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const POSITIVE = /gracias|perfecto|genial|excelente|buenisimo|dale|de acuerdo|ok\b|listo|me sirve|me interesa|confirmo|manda(me)? (la )?(factura|cuenta|datos)/;
const NEGATIVE = /reclamo|queja|mal\b|roto|no funciona|demora|tarde|caro|muy caro|no me sirve|cancel|devol|problema|enojad|nunca (llego|vino)/;
const BUY = /quiero comprar|necesito comprar|confirmo|hace(me)? el pedido|mandame (el )?(pedido|cuenta|datos)|pasame (el )?(cbu|alias|datos)|cuando (lo )?(puedo|pueden) retirar|reservame|lo llevo|facturame|cuantas unidades|hay stock|tenes stock/;
const PRICE = /precio|cotiz|cuanto sale|cuanto cuesta|valor|presupuesto|lista de precios/;
const URGENT = /hoy|urgente|manana|esta semana|cuanto antes|para el (lunes|martes|miercoles|jueves|viernes)/;
const TECH = /ficha tecnica|rendimiento|aplicacion|compatib|curado|sirve para/;
const OBJECTION = /muy caro|esta caro|mas barato|descuento|rebaja|lo voy a pensar|despues (te )?aviso|consulto con/;

export function analyzeConversation(events = [], { now = new Date() } = {}) {
  const messages = events
    .filter((event) => event.direction === 'inbound' || event.direction === 'outbound')
    .filter((event) => String(event.text_body || '').trim())
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  if (!messages.length) return { empty: true, readiness: null, sentiment: 'Sin datos', summary: '', signals: [], competitors: [], nextStep: '', awaitingReply: false };

  const inbound = messages.filter((event) => event.direction === 'inbound');
  const lastInbound = inbound.at(-1);
  const lastMessage = messages.at(-1);
  const customerText = plain(inbound.map((event) => event.text_body).join(' \n '));
  const lastCustomerText = plain(inbound.slice(-3).map((event) => event.text_body).join(' '));

  const signals = [];
  let readiness = 1;
  if (inbound.length >= 1) readiness += 1;
  if (TECH.test(customerText)) { readiness += 1; signals.push('Consulta técnica'); }
  if (PRICE.test(customerText)) { readiness += 2; signals.push('Pidió precio'); }
  if (URGENT.test(customerText)) { readiness += 2; signals.push('Hay apuro'); }
  if (BUY.test(customerText)) { readiness += 3; signals.push('Lenguaje de compra'); }
  if (OBJECTION.test(customerText)) { readiness -= 1; signals.push('Objeción de precio / lo piensa'); }
  if (inbound.length >= 4) readiness += 1;

  const negative = NEGATIVE.test(lastCustomerText);
  const positive = POSITIVE.test(lastCustomerText);
  const sentiment = negative && !positive ? 'Negativo' : positive && !negative ? 'Positivo' : negative && positive ? 'Mixto' : 'Neutro';
  if (negative) readiness -= 1;

  const competitors = COMPETITORS.filter((name) => customerText.includes(plain(name)));
  if (competitors.length) signals.push(`Menciona a ${competitors.join(', ')}`);

  const awaitingReply = lastMessage.direction === 'inbound';
  const hoursSince = Math.max(0, (now - new Date(lastMessage.occurred_at)) / 3_600_000);
  if (!awaitingReply && hoursSince > 72) readiness -= 1;

  readiness = Math.max(1, Math.min(10, readiness));

  let nextStep;
  if (negative && !positive) nextStep = 'Responder el reclamo hoy y registrar qué pasó.';
  else if (awaitingReply && BUY.test(lastCustomerText)) nextStep = 'Cliente listo: confirmar pedido, precio y forma de pago ahora.';
  else if (awaitingReply && PRICE.test(lastCustomerText)) nextStep = 'Enviar la cotización.';
  else if (awaitingReply) nextStep = 'Tiene un mensaje del cliente sin responder.';
  else if (hoursSince > 72 && readiness >= 4) nextStep = 'Hace más de 3 días que no contesta: hacer seguimiento.';
  else nextStep = 'Esperar respuesta del cliente.';

  const first = String(inbound[0]?.text_body || '').trim().slice(0, 110);
  const last = String(lastInbound?.text_body || '').trim().slice(0, 110);
  const summary = `${messages.length} mensajes (${inbound.length} del cliente). Empezó con: “${first}”${inbound.length > 1 ? ` · Último: “${last}”` : ''}.`;

  return { empty: false, readiness, sentiment, summary, signals, competitors, nextStep, awaitingReply };
}
