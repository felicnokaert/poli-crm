function normalize(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Un insumo que un cliente compró más de una vez tiene un ciclo de consumo:
// el intervalo promedio entre sus compras. Si ya pasó más tiempo que ese
// promedio desde la última compra, probablemente esté por quedarse sin
// stock — se lo marca como "para reponer" sin que el cliente tenga que
// escribir primero.
//
// Cuando las facturas tienen cantidad cargada (no todas las viejas la
// tienen), también se promedia cuánto lleva por compra - así la reposición
// sugerida no es solo "cuándo" sino "cuánto", sin inventar un número para
// las facturas que no traen cantidad.
export function buildRepurchaseRadar(sales = [], today = new Date()) {
  const groups = new Map();
  for (const sale of sales) {
    for (const item of sale.items || []) {
      if (!item.description || !sale.date) continue;
      const key = `${normalize(sale.customer)}|${normalize(item.description)}`;
      if (!groups.has(key)) groups.set(key, { customer: sale.customer, product: item.description, dates: [], quantities: [] });
      const group = groups.get(key);
      group.dates.push(sale.date);
      const quantity = Number(item.quantity);
      if (Number.isFinite(quantity) && quantity > 0) group.quantities.push(quantity);
    }
  }
  const results = [];
  for (const { customer, product, dates, quantities } of groups.values()) {
    const sorted = [...new Set(dates)].sort();
    if (sorted.length < 2) continue;
    const intervals = [];
    for (let index = 1; index < sorted.length; index += 1) intervals.push(daysBetween(sorted[index - 1], sorted[index]));
    const avgIntervalDays = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    if (avgIntervalDays <= 0) continue;
    const lastDate = sorted[sorted.length - 1];
    const daysSinceLast = daysBetween(lastDate, today.toISOString().slice(0, 10));
    if (daysSinceLast < avgIntervalDays) continue;
    // Puede haber menos cantidades que fechas (facturas viejas sin cantidad
    // cargada) - promediamos solo sobre las compras que sí la tienen.
    const avgQuantity = quantities.length ? Math.round((quantities.reduce((sum, value) => sum + value, 0) / quantities.length) * 100) / 100 : null;
    results.push({
      customer,
      product,
      avgIntervalDays: Math.round(avgIntervalDays),
      daysSinceLast,
      overdueDays: Math.round(daysSinceLast - avgIntervalDays),
      lastDate,
      purchaseCount: sorted.length,
      avgQuantity,
    });
  }
  return results.sort((a, b) => b.overdueDays - a.overdueDays);
}
