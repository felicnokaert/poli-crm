function normalizeName(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Mismo criterio que commercialOutcome() en app-shared.jsx, repetido a
// propósito - ver la misma nota en stale-clients-radar.mjs sobre por qué
// este módulo es puro (.mjs, sin React/App.jsx).
function isOpenOutcome(client = {}) {
  if (client.outcome) return client.outcome === 'Abierto';
  if (client.stage === 'Ganado' || client.stage === 'Perdido' || client.stage === 'Pausado') return false;
  return true;
}

// Mismo criterio de match por nombre que ya usan cold-quotes.mjs y
// stale-clients-radar.mjs (no hay clientId en las ventas todavía).
function hasSaleAfter(client, sales, sinceISO) {
  const nameKey = normalizeName(client.company || client.legalName || '');
  if (!nameKey) return false;
  return sales.some((sale) => {
    const saleName = normalizeName(sale.customer);
    if (!saleName) return false;
    if (!(saleName.includes(nameKey) || nameKey.includes(saleName))) return false;
    return new Date(sale.date) >= new Date(sinceISO);
  });
}

// Clientes activos con una cotización marcada (`client.lastQuotedAt`, ver
// el botón "Marqué que coticé hoy" en ClientDetail.jsx) que lleva `minDays`
// o más sin convertirse en venta. A propósito NO depende de la etapa del
// pipeline ni de cuándo cambió de etapa (ese dato no existe todavía, ver
// AUDITORIA_MADUREZ_PRODUCTO_2026-09-15-septima.md) - usa la única fecha
// real que Felipe puede marcar con un click, sin tener que adjuntar el
// presupuesto de Contabilium ni cambiar de forma de trabajar. Un cliente
// sin `lastQuotedAt` nunca aparece acá: no se infiere una cotización que
// nadie marcó.
export function findExpiredQuotes(clients = [], sales = [], { today = new Date(), minDays = 15 } = {}) {
  const results = [];
  for (const client of clients) {
    if (!client.lastQuotedAt) continue;
    if (!isOpenOutcome(client)) continue;
    if (hasSaleAfter(client, sales, client.lastQuotedAt)) continue;
    const daysSince = daysBetween(client.lastQuotedAt, today.toISOString());
    if (daysSince < minDays) continue;
    results.push({
      clientId: client.id,
      company: client.company || client.legalName || '',
      daysSince,
      lastQuotedAt: client.lastQuotedAt,
    });
  }
  return results.sort((a, b) => b.daysSince - a.daysSince);
}
