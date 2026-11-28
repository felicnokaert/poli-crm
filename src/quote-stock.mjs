// Stock de Contabilium en el cotizador nativo (28/11, mismo dato que el cotizador de siempre): crm_system_status key
// contabilium-stock (por empresa, items por código con d.vd y d.mdq), sumado por código entre empresas. Solo avisa.
export const normCode = (code = '') => String(code).toUpperCase().replace(/\s+/g, '');

export function stockMap(detail = {}) {
  const map = new Map();
  let at = '';
  for (const company of Object.values(detail?.companies || {})) {
    if (company?.at && company.at > at) at = company.at;
    for (const [code, item] of Object.entries(company?.items || {})) {
      const key = normCode(code);
      const current = map.get(key) || { vd: null, mdq: null };
      const d = item?.d || {};
      if (typeof d.vd === 'number') current.vd = (current.vd || 0) + d.vd;
      if (typeof d.mdq === 'number') current.mdq = (current.mdq || 0) + d.mdq;
      map.set(key, current);
    }
  }
  return { map, at };
}

const qty = (value) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);

/** «Stock: 12 VD · 3 MDQ», «Sin stock» o null si no hay dato de ese código. */
export function stockLabel(stock) {
  if (!stock || (stock.vd == null && stock.mdq == null)) return null;
  const vd = stock.vd || 0;
  const mdq = stock.mdq || 0;
  if (vd <= 0 && mdq <= 0) return { text: 'Sin stock', tone: 'none' };
  return { text: `Stock: ${qty(vd)} VD · ${qty(mdq)} MDQ`, tone: 'ok' };
}

export async function loadStock(supabase) {
  try {
    const { data, error } = await supabase.from('crm_system_status').select('detail').eq('key', 'contabilium-stock').maybeSingle();
    if (error || !data) return { map: new Map(), at: '' };
    return stockMap(data.detail || {});
  } catch { return { map: new Map(), at: '' }; }
}
