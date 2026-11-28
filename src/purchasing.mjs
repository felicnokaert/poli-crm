// Compras → «Qué se termina» (28/11): stock de Contabilium por depósito (crm_system_status contabilium-stock) contra
// lo vendido en 6 meses (vista contabilium_ventas_por_codigo). Cobertura = stock ÷ venta diaria. Solo avisa: no compra nada.
import { normCode } from './quote-stock.mjs';

export const STATES = [['sin-stock', 'Sin stock'], ['critico', 'Menos de 15 días'], ['bajo', '15 a 30 días'], ['ok', 'Más de 30 días']];
export const stateLabel = (id) => STATES.find(([key]) => key === id)?.[1] || id;

export function coverageState(days) {
  if (days == null) return 'ok';
  if (days <= 0) return 'sin-stock';
  if (days < 15) return 'critico';
  if (days < 30) return 'bajo';
  return 'ok';
}

// sales: filas de la vista (codigo, unidades_6m, unidades_12m, usd_6m, ultima_venta, nombre, rubro, subrubro, empresas).
// stock: Map normCode → { vd, mdq } (stockMap de quote-stock.mjs). Solo lo que se vendió en 6 meses.
export function runningOut(sales = [], stock = new Map()) {
  const rows = [];
  for (const sale of sales) {
    const units6 = Number(sale.unidades_6m) || 0;
    if (units6 <= 0) continue;
    const s = stock.get(normCode(sale.codigo));
    if (!s) continue; // sin dato de stock de ese código: no se puede decir nada
    const total = (s.vd || 0) + (s.mdq || 0);
    const perDay = units6 / 182;
    const days = total <= 0 ? 0 : Math.round(total / perDay);
    rows.push({
      code: sale.codigo, name: sale.nombre || '', rubro: sale.rubro || '', subrubro: sale.subrubro || '',
      vd: s.vd, mdq: s.mdq, total, units6, perMonth: Math.round(perDay * 30 * 10) / 10, usd6: Number(sale.usd_6m) || 0,
      lastSale: sale.ultima_venta || '', days, state: coverageState(total <= 0 ? 0 : days),
      // Para reponer 60 días de venta.
      suggest: Math.max(0, Math.ceil(perDay * 60 - Math.max(0, total))),
    });
  }
  return rows.sort((a, b) => a.days - b.days || b.usd6 - a.usd6);
}
