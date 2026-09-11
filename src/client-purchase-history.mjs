// Última compra real de un cliente, detectada de las facturas ya cargadas -
// nunca del campo de texto libre "Última compra" que carga una persona a
// mano. Las facturas no traen un id de cliente, solo la razón social
// (Contabilium) - se empareja por nombre normalizado, mismo criterio que ya
// usa src/repurchase-radar.mjs para no duplicar otra forma de comparar.
function normalize(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

function clientNameKeys(client = {}) {
  return [...new Set([client.company, client.legalName].map(normalize).filter(Boolean))];
}

// Devuelve null si ninguna venta matchea - nunca inventa una fecha.
export function lastPurchaseForClient(client = {}, sales = []) {
  const keys = new Set(clientNameKeys(client));
  if (!keys.size) return null;
  const matches = sales.filter((sale) => sale.date && keys.has(normalize(sale.customer)));
  if (!matches.length) return null;
  const latest = matches.reduce((best, sale) => (sale.date > best.date ? sale : best));
  return {
    date: latest.date,
    unit: latest.unit || '',
    products: [...new Set((latest.items || []).map((item) => item.description).filter(Boolean))],
    invoiceCount: matches.length,
  };
}
