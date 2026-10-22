// Los números del negocio para el asistente (22/10): "¿cuántas cotizaciones cerramos?", "¿qué clientes están
// atrasados?", "¿a quién reactivo?". Usa la facturación de Contabilium que ya lee la Cola del día (misma
// lectura en memoria) y las mismas reglas: quoteConversion, overdueQueue y reactivationQueue. Sin IA ni costo.
import { plain } from './knowledge-search.mjs';
import { buildCustomerBase } from './customer-base.mjs';
import { overdueQueue, reactivationQueue } from './daily-queues.mjs';
import { quoteConversion } from './quote-conversion.mjs';

const ASK = /\b(cotizaciones|cotizamos|cerramos|cerradas|cierre|conversion|atrasad\w*|se pasaron|frecuencia|reactiv\w*|dormid\w*|dejaron de comprar|a quien llamo|a quien llamar|que clientes (llamo|llamar|contacto)|numeros|como venimos|como vamos|resumen de la semana)\b/;
export const asksBusiness = (query) => ASK.test(plain(query));

const pesos = (value) => `$ ${Math.round(value || 0).toLocaleString('es-AR')}`;

export function businessFacts(rows = [], clients = [], today) {
  const { byClient } = buildCustomerBase(rows, clients, { today });
  return {
    quotes: quoteConversion(rows, { today }),
    overdue: overdueQueue({ clients, base: byClient, today, limit: 10 }),
    reactivate: reactivationQueue({ clients, base: byClient, today, limit: 8 }),
  };
}

export function businessLines(facts) {
  if (!facts) return [];
  const lines = [];
  const { quotes, overdue, reactivate } = facts;
  if (quotes?.quotes) {
    lines.push(`Cotizaciones de Contabilium (12 meses): ${quotes.quotes}, cerradas ${quotes.closed} (con factura en 60 días), sin factura ${quotes.lost}, en curso ${quotes.pending}${quotes.rate != null ? ` → se cierra el ${quotes.rate} %` : ''}${quotes.medianDays != null ? ` en ${quotes.medianDays} días` : ''}. Cotizado ${pesos(quotes.quotedAmount)}, facturado de eso ${pesos(quotes.closedAmount)}.`);
    const last = quotes.byMonth.slice(-3).map((month) => `${month.key.split('-').reverse().join('/')}: ${month.closed}/${month.quotes}${month.rate != null ? ` (${month.rate} %)` : ' (en curso)'}`).join(' · ');
    if (last) lines.push(`Últimos meses (cerradas/cotizadas): ${last}.`);
  }
  if (overdue?.length) lines.push(`Clientes que se pasaron de su frecuencia de compra (${overdue.length}): ${overdue.map((item) => `${item.client.company} (compra cada ~${item.info.frequencyDays} días, última hace ${item.info.daysSince}${item.info.big ? ', grande' : ''})`).join('; ')}.`);
  if (reactivate?.length) lines.push(`Para reactivar (buenos clientes dormidos): ${reactivate.map((item) => `${item.client.company} (última compra hace ${item.info.daysSince} días)`).join('; ')}.`);
  return lines;
}

export function businessContext(facts) {
  const lines = businessLines(facts);
  return lines.length ? ['NÚMEROS DEL NEGOCIO (de la facturación de Contabilium, sin las ventas de Mercado Libre):', ...lines.map((line) => `- ${line}`)].join('\n') : '';
}
