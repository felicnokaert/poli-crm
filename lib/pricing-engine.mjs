// Motor de precios en el servidor (27/11). Sin tablas nuevas: crm_system_status key pricing-engine,
// detail { params, costs: { SKU: { usd, by, at } } }. Los costos son delicados: solo los ven y cargan los
// administradores y quienes manejan precios (Diego, Juan, David). El resto del equipo pide el precio con op 'quote'
// y recibe el resultado SIN el costo ni el margen.
import { db } from './mercadolibre.mjs';
import { cleanParams, computePrice, mergeCosts, normSku } from '../src/pricing-engine.mjs';

export const PRICING_KEY = 'pricing-engine';
export const PRICE_EDITORS = ['diegoraul@grupopoliplast.com.ar', 'juan@grupopoliplast.com.ar', 'david@grupopoliplast.com.ar'];

export async function readPricing(store) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${PRICING_KEY}`).catch(() => []);
  const detail = rows?.[0]?.detail || {};
  return { params: cleanParams(detail.params), costs: detail.costs && typeof detail.costs === 'object' ? detail.costs : {} };
}

async function writePricing(store, state) {
  await store.upsert('crm_system_status', [{ key: PRICING_KEY, ok: true, last_run_at: new Date().toISOString(), detail: state }]);
  return state;
}

// Lo que ve quien no maneja precios: el precio final y los pasos sin el costo.
export function publicResult(result) {
  if (!result || result.error) return result;
  const steps = result.steps.slice(1).map((step) => ({ label: step.label }));
  return { net: result.net, gross: result.gross, vat: result.vat, quantity: result.quantity, totalNet: result.totalNet, totalGross: result.totalGross, steps, example: result.example };
}

export async function pricingEngineAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const mail = String(caller.email || '').toLowerCase();
  const editor = isAdmin(mail) || PRICE_EDITORS.includes(mail);
  const store = db(environment, http);
  const body = request.body || {};
  const op = body.op || 'get';
  const state = await readPricing(store);
  if (op === 'get') return { status: 200, body: { ok: true, editor, params: state.params, ...(editor ? { costs: state.costs } : { costCount: Object.keys(state.costs).length }) } };
  if (op === 'quote') {
    const sku = normSku(body.sku);
    const result = computePrice({ cost: state.costs[sku]?.usd, product: body.product || {}, clientType: body.clientType, quantity: body.quantity, payment: body.payment || null, params: state.params });
    return { status: 200, body: { ok: true, result: editor ? result : publicResult(result) } };
  }
  if (!editor) return { status: 403, body: { error: 'Solo administración, Diego, Juan o David cambian el motor de precios.' } };
  const at = new Date().toISOString();
  if (op === 'save-params') {
    const params = cleanParams({ ...body.params, example: false });
    return { status: 200, body: { ok: true, ...(await writePricing(store, { ...state, params, paramsBy: mail, paramsAt: at })) } };
  }
  if (op === 'save-costs') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 3000) : [];
    if (!rows.length) return { status: 400, body: { error: 'No hay costos para guardar.' } };
    const costs = mergeCosts(state.costs, rows, { who: mail, at });
    return { status: 200, body: { ok: true, ...(await writePricing(store, { ...state, costs })) } };
  }
  return { status: 400, body: { error: 'Operación desconocida.' } };
}
