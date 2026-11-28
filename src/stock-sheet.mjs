// Hoja de stock completa (28/11, Felipe: «sumame las columnas, páginas, ordenarlo y filtrarlo»; «tienen que estar todos los
// productos»; «que sean productos activos, no impuestos, no fletes, no envíos…»). La base es el CATÁLOGO MAESTRO (la limpieza
// que se hizo con Diego: catalog_variants activas), más lo que se contó en la app de conteo aunque no esté en el catálogo.
// Lo de Contabilium que no está en ninguno de los dos va a «Revisar» (puede ser un producto que se pasó o basura: impuesto,
// flete, cheque…). Ventas de 6/12 meses: cuando el CRM guarde los renglones de las ventas (contabilium_items).

export const normCode = (code = '') => String(code).trim().toUpperCase().replace(/\s+/g, '');
const plain = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Nombres que no son productos (cuando hay nombre): impuestos, fletes, envíos, cheques, gastos, servicios…
const NOT_PRODUCT = /\b(impuesto|imp\.? interno|flete|envio|envios|cheque|no sirve|gasto|gastos|percepcion|retencion iibb|interes|intereses|recargo|sena|anticipo|redondeo|bonificacion)\b|\(carrozados?\)/;
export const isNotProduct = (name = '') => NOT_PRODUCT.test(plain(name));

// detail de crm_system_status «contabilium-stock» → mapa CODIGO → { vd, mdq, total, companies: [...] }.
export function contabiliumIndex(detail = {}) {
  const out = new Map();
  for (const [company, data] of Object.entries(detail?.companies || {})) {
    for (const [code, item] of Object.entries(data?.items || {})) {
      const key = normCode(code);
      const current = out.get(key) || { vd: null, mdq: null, companies: [], name: '' };
      const depots = item?.d || {};
      if (depots.vd != null) current.vd = (current.vd || 0) + Number(depots.vd);
      if (depots.mdq != null) current.mdq = (current.mdq || 0) + Number(depots.mdq);
      if (!current.companies.includes(company)) current.companies.push(company);
      if (!current.name && item?.n) current.name = item.n;
      out.set(key, current);
    }
  }
  for (const value of out.values()) value.total = value.vd == null && value.mdq == null ? null : (value.vd || 0) + (value.mdq || 0);
  return out;
}

// catalog: [{ sku, name, family, subfamily }] (activas) · products: pivotStock(...) (contados) · cb: contabiliumIndex(...).
export function buildSheet({ catalog = [], products = [], cb = new Map() } = {}) {
  const rows = new Map();
  for (const item of catalog) {
    const key = normCode(item.sku);
    if (!key || rows.has(key)) continue;
    rows.set(key, { sku: item.sku, name: item.name || item.sku, family: item.family || '', subfamily: item.subfamily || '', vd: null, mdq: null, inCatalog: true, counted: false });
  }
  for (const product of products) {
    const key = normCode(product.sku);
    if (!key) continue;
    const row = rows.get(key) || { sku: product.sku, name: product.name, family: '', subfamily: '', inCatalog: false };
    rows.set(key, { ...row, vd: product.vd || null, mdq: product.mdq || null, counted: Boolean(product.vd || product.mdq), countCategory: product.category || '', countStatus: product.status });
  }
  return [...rows.entries()].map(([key, row]) => {
    const item = cb.get(key);
    const ats = [row.vd?.at, row.mdq?.at].filter(Boolean).sort();
    const status = row.counted ? row.countStatus : 'sin-conteo';
    return {
      ...row,
      family: row.family || (row.inCatalog ? '' : 'Contado, fuera del catálogo'),
      companies: item?.companies || [],
      cbVd: item?.vd ?? null,
      cbMdq: item?.mdq ?? null,
      cbTotal: item?.total ?? null,
      lastAt: ats.pop() || '',
      status: status === 'sin-conteo' || !status ? 'sin-conteo' : status,
    };
  });
}

// En Contabilium con stock (distinto de 0) y que no está ni en el catálogo ni contado: para que Felipe/Diego decidan.
export function reviewList(cb = new Map(), sheet = []) {
  const known = new Set(sheet.map((row) => normCode(row.sku)));
  const out = [];
  for (const [code, item] of cb.entries()) {
    if (known.has(code) || !item.total) continue;
    if (item.name && isNotProduct(item.name)) continue;
    out.push({ sku: code, name: item.name || '', companies: item.companies, cbVd: item.vd, cbMdq: item.mdq, cbTotal: item.total });
  }
  return out.sort((a, b) => Math.abs(b.cbTotal) - Math.abs(a.cbTotal));
}

const STATUS_ORDER = { sin: 0, poco: 1, hay: 2, 'sin-conteo': 3 };
const countValue = (cell) => (cell ? (cell.kgNow ?? cell.count ?? 0) : null);
const SORTERS = {
  name: (row) => plain(row.name),
  family: (row) => plain(`${row.family} ${row.subfamily}`),
  companies: (row) => plain(row.companies.join(' ')),
  vd: (row) => countValue(row.vd),
  mdq: (row) => countValue(row.mdq),
  cbVd: (row) => row.cbVd,
  cbMdq: (row) => row.cbMdq,
  lastAt: (row) => row.lastAt || null,
  status: (row) => STATUS_ORDER[row.status] ?? 9,
};
export const SORT_KEYS = Object.keys(SORTERS);

export function filterSheet(rows = [], { query = '', company = '', family = '', subfamily = '', status = '' } = {}) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (company && !row.companies.includes(company)) return false;
    if (family && row.family !== family) return false;
    if (subfamily && row.subfamily !== subfamily) return false;
    if (status === 'falta' && !(row.status === 'sin' || row.status === 'poco')) return false;
    if (status && status !== 'falta' && row.status !== status) return false;
    if (!words.length) return true;
    const text = plain(`${row.sku} ${row.name} ${row.family} ${row.subfamily} ${row.countCategory || ''}`);
    return words.every((word) => text.includes(word));
  });
}

// Orden: vacíos siempre al final, sin importar la dirección.
export function sortSheet(rows = [], key = 'name', dir = 'asc') {
  const get = SORTERS[key] || SORTERS.name;
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return plain(a.name).localeCompare(plain(b.name), 'es');
    if (x == null) return 1;
    if (y == null) return -1;
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
    return cmp ? cmp * sign : plain(a.name).localeCompare(plain(b.name), 'es');
  });
}

export function paginate(rows = [], page = 1, size = 30) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}

export function facets(rows = []) {
  const families = new Map();
  const companies = new Set();
  for (const row of rows) {
    if (row.family) {
      const subs = families.get(row.family) || new Set();
      if (row.subfamily) subs.add(row.subfamily);
      families.set(row.family, subs);
    }
    row.companies.forEach((company) => companies.add(company));
  }
  const sortEs = (list) => [...list].sort((a, b) => a.localeCompare(b, 'es'));
  return { families: sortEs(families.keys()), subfamilies: (family) => sortEs(families.get(family) || []), companies: sortEs(companies) };
}
