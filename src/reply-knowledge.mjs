// Conocimiento para la respuesta sugerida de WhatsApp (29/10): lo mismo que usa el asistente, pero armado a partir del
// último mensaje del cliente: lo que el equipo ya respondió en Mercado Libre (la respuesta que más repetimos), lo que
// Felipe enseñó y los precios de lista vigentes del cotizador. Si algo falla o no hay, sigue sin eso (nunca frena el borrador).
import { buildAiContext, detectIntent, matchTaught, mlQuery, teamAnswer } from './assistant-answer.mjs';
import { asksPrice, pricesContext, priceWords } from './assistant-prices.mjs';

const safe = async (promise, fallback) => { try { return await promise; } catch { return fallback; } };

export async function loadReplyKnowledge(supabase, text, { today, loadPrices = null } = {}) {
  const query = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!query || !supabase) return '';
  const intent = detectIntent(query);
  const [mlRows, taughtAll, prices] = await Promise.all([
    intent && supabase.rpc ? safe(supabase.rpc('search_ml_knowledge', { q: mlQuery(query, intent), max_rows: 40 }).then(({ data, error }) => (error ? [] : data || [])), []) : [],
    supabase.from ? safe(Promise.resolve(supabase.from('assistant_knowledge').select('id,question,product,answer,updated_at')).then(({ data }) => data || []), []) : [],
    loadPrices && asksPrice(query) ? safe(loadPrices(supabase, priceWords(query), today), []) : [],
  ]);
  // Las reglas de la empresa ya van en el prompt; acá solo lo enseñado sobre el tema.
  const taught = matchTaught(taughtAll.filter((entry) => entry.product !== 'regla'), query);
  const team = intent ? teamAnswer(mlRows, intent) : null;
  return [pricesContext(prices), buildAiContext({ intent, team, mlRows, taught })].filter(Boolean).join('\n');
}
