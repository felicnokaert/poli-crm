// Poliplast App (26/11, Felipe: «prospección con IA: que busque y devuelva la lista, no un prompt para copiar»).
// El servidor le pasa a Claude el MISMO pedido que antes se copiaba (buildResearchPrompt: familia, alcance, exclusiones)
// con la herramienta de búsqueda web de Anthropic, y devuelve la tabla + CSV, que la pantalla importa con el importador
// de siempre (vista previa antes de cargar). Costo aproximado por búsqueda con Haiku: ~US$ 0,05 (6 búsquedas web a
// US$ 0,01 + lectura). Tope diario global para no gastar de más (PROSPECT_AI_DAILY_CAP, por defecto 30).
import { db } from './mercadolibre.mjs';

const API = 'https://api.anthropic.com/v1/messages';
export const USAGE_KEY = 'prospect-ai-usage';
const MAX_SEARCHES = 6;
const BUDGET_MS = 52000;
// Precios por millón de tokens (entrada / salida) y por búsqueda web, para mostrar cuánto costó.
const PRICES = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };
const SEARCH_USD = 0.01;

export const AI_RULES = `\n\nIMPORTANTE (búsqueda automática desde la app): hacé como máximo ${MAX_SEARCHES} búsquedas web y no más de 10 empresas. Escribí el razonamiento en 3 líneas como mucho. La TABLA y el bloque CSV (separado por punto y coma, con las mismas columnas) son obligatorios. Solo datos que aparezcan en las fuentes: nada inventado.`;

export function costOf(model, usage = {}) {
  const [input, output] = PRICES[model] || PRICES['claude-haiku-5-5'];
  const searches = Number(usage.server_tool_use?.web_search_requests) || 0;
  const tokens = ((Number(usage.input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0)) * input / 1e6 + (Number(usage.cache_read_input_tokens) || 0) * input * 0.1 / 1e6 + (Number(usage.output_tokens) || 0) * output / 1e6;
  return { searches, usd: Math.round((tokens + searches * SEARCH_USD) * 1000) / 1000 };
}

export function textOf(content = []) {
  return content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

async function takeQuota(store, cap, today) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${USAGE_KEY}`).catch(() => null);
  if (!Array.isArray(rows)) return { ok: false, reason: 'No se pudo leer el tope diario.' };
  const detail = rows[0]?.detail || {};
  const used = detail.day === today ? Number(detail.count) || 0 : 0;
  if (used >= cap) return { ok: false, reason: `Ya se hicieron ${used} búsquedas con IA hoy (tope ${cap}). Mañana se renueva.` };
  await store.upsert('crm_system_status', [{ key: USAGE_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { day: today, count: used + 1, usd: (detail.day === today ? Number(detail.usd) || 0 : 0) } }]);
  return { ok: true, used: used + 1, detail };
}

async function addCost(store, today, usd) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${USAGE_KEY}`).catch(() => []);
  const detail = rows?.[0]?.detail || {};
  if (detail.day !== today) return;
  await store.upsert('crm_system_status', [{ key: USAGE_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { ...detail, usd: Math.round(((Number(detail.usd) || 0) + usd) * 1000) / 1000 } }]).catch(() => {});
}

// prompt = buildResearchPrompt(...) armado en el navegador (familia, alcance, cantidad, exclusiones).
export async function prospectAiSearch({ prompt }, environment = process.env, http = fetch, now = Date.now()) {
  if (!environment.ANTHROPIC_API_KEY) return { status: 200, body: { ok: false, error: 'Falta la clave de Anthropic en el servidor.' } };
  const text = String(prompt || '').slice(0, 8000);
  if (text.length < 80) return { status: 400, body: { ok: false, error: 'Falta el pedido.' } };
  const store = db(environment, http);
  const today = new Date(now - 3 * 3600000).toISOString().slice(0, 10);
  const cap = Math.max(1, Math.min(100, Number(environment.PROSPECT_AI_DAILY_CAP) || 30));
  const quota = await takeQuota(store, cap, today);
  if (!quota.ok) return { status: 429, body: { ok: false, error: quota.reason } };
  const model = environment.PROSPECT_AI_MODEL || 'claude-haiku-5-5';
  const headers = { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) };
  const messages = [{ role: 'user', content: text + AI_RULES }];
  const tool = { name: 'web_search', max_uses: MAX_SEARCHES, user_location: { type: 'approximate', country: 'AR', timezone: 'America/Argentina/Buenos_Aires' } };
  const types = /haiku/.test(model) ? ['web_search_20250305', 'web_search_20260209'] : ['web_search_20260209', 'web_search_20250305'];
  const started = Date.now();
  let output = '';
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  let typeIndex = 0;
  try {
    for (let round = 0; round < 4 && Date.now() - started < BUDGET_MS; round += 1) {
      const body = { model, max_tokens: 8000, messages, tools: [{ type: types[typeIndex], ...tool }], ...(/haiku/.test(model) ? { thinking: { type: 'disabled' } } : { output_config: { effort: 'low' } }) };
      const response = await http(API, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(5000, BUDGET_MS - (Date.now() - started))) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result?.error?.message || `HTTP ${response.status}`;
        if (response.status === 400 && /web_search|tool/i.test(detail) && typeIndex === 0) { typeIndex = 1; round -= 1; continue; }
        console.error('prospect-ai', response.status, detail);
        return { status: 200, body: { ok: false, error: `La IA no pudo buscar: ${detail}` } };
      }
      for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) usage[key] += Number(result.usage?.[key]) || 0;
      usage.server_tool_use.web_search_requests += Number(result.usage?.server_tool_use?.web_search_requests) || 0;
      output += textOf(result.content);
      // pause_turn: la búsqueda quedó a mitad; se reenvía para que siga donde estaba.
      if (result.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: result.content }); continue; }
      break;
    }
  } catch (error) {
    console.error('prospect-ai', error?.message);
    if (!output) return { status: 200, body: { ok: false, error: 'La búsqueda tardó demasiado. Probá con un alcance más chico (una provincia o ciudad).' } };
  }
  const cost = costOf(model, usage);
  await addCost(store, today, cost.usd);
  if (!output.trim()) return { status: 200, body: { ok: false, error: 'La IA no devolvió resultados. Probá de nuevo o con otro alcance.', cost } };
  return { status: 200, body: { ok: true, text: output, model, cost, usedToday: quota.used, cap } };
}
