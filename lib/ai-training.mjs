// Entrenamiento intensivo del asistente (21/11, Felipe: «que se alimente solo y entrene; yo no tengo tiempo de revisar»,
// crédito de Anthropic hasta el 25/11). Corre SOLO en el servidor, por tandas de menos de 60 s (crons ?cron=entrenamiento-N),
// y guarda lo aprendido en assistant_knowledge con created_by_email = 'ia-entrenamiento' para distinguirlo de lo de Felipe
// (el asistente lo presenta como «aprendido solo, sin revisar») y poder deshacerlo de una vez.
// Tres fuentes, de la más segura a la que más gasta:
//  1) Respuestas que el equipo repitió 3+ veces en Mercado Libre (sin IA, gratis): se guardan tal cual.
//  2) Temas con respuestas distintas del equipo: la IA las junta en una sola SIN agregar datos; si se contradicen o no
//     alcanzan, NO se guarda nada (queda contado como conflicto).
//  3) Fichas técnicas vigentes de Base técnica: la IA saca preguntas y respuestas usando SOLO el texto de la ficha.
// Frena solo: apagado, después de la fecha límite, con la pausa global de lo automático o al llegar al tope diario en dólares.
import { db } from './mercadolibre.mjs';
import { readPause } from './automation-pause.mjs';
import { DRAFT_PROMPT, buildDraftMessages, parseDraft } from './assistant-ai.mjs';
import { draftCandidates } from '../src/assistant-draft.mjs';
import { suggestTeachings } from '../src/assistant-training.mjs';
import { arToday } from '../src/ar-date.mjs';

export const TRAINING_KEY = 'ai-training';
export const TRAINER = 'ia-entrenamiento';
const API = 'https://api.anthropic.com/v1/messages';
const CALL_MS = 28000;
// Modelo fuerte solo para entrenar (el asistente del día a día sigue en el barato). Precio en US$ por millón de tokens.
export const TRAINING_MODEL = 'claude-opus-5-5';
const PRICE = { input: 4, output: 20 };
export const DEFAULTS = { enabled: false, until: '2026-11-25', dailyBudget: 20 };

export const costOf = (usage = {}) => ((Number(usage.input_tokens) || 0) * PRICE.input + (Number(usage.output_tokens) || 0) * PRICE.output) / 1e6;
const norm = (text = '') => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const keyOf = (product, question) => `${norm(product)}|${norm(question)}`;

export const DOC_PROMPT = [
  'Sos un editor de conocimiento de Grupo Poliplast (poliuretano, poliurea, resinas, espumas, adhesivos, máquinas). Te paso el TEXTO de una ficha técnica.',
  'Escribí las preguntas que más haría un cliente o un vendedor sobre ese producto (rendimiento, consumo, mezcla, tiempos, espesor, temperatura, usos, aplicación, preparación de la superficie, almacenamiento, presentación, seguridad) y su respuesta.',
  'Usá SOLO datos que estén escritos en la ficha: no agregues números, compatibilidades ni recomendaciones que no figuren. Si la ficha no dice algo, no preguntes sobre eso. Respuestas cortas (hasta 50 palabras), claras, sin links ni mails.',
  'Contestá SOLO un JSON en una línea: {"producto":"nombre corto o código del producto","items":[{"pregunta":"…","respuesta":"…"}]} con hasta 12 items. Si la ficha no tiene datos útiles, items vacío.',
].join('\n');

export function parseDocQa(text = '') {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return { product: '', items: [] };
  try {
    const data = JSON.parse(match[0]);
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((item) => ({ question: String(item?.pregunta || '').trim().slice(0, 300), answer: String(item?.respuesta || '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 600) }))
      .filter((item) => item.question.length > 5 && item.answer.length > 3)
      .slice(0, 12);
    return { product: String(data.producto || '').trim().slice(0, 120), items };
  } catch { return { product: '', items: [] }; }
}

async function claude(environment, http, { system, content, maxTokens }) {
  const response = await http(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) },
    // effort low: es extracción y resumen; con más esfuerzo tarda más y no entra en el minuto del servidor.
    body: JSON.stringify({ model: environment.ASSISTANT_TRAINING_MODEL || TRAINING_MODEL, max_tokens: maxTokens, system, output_config: { effort: 'low' }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(CALL_MS),
  });
  const body = await response.json().catch(() => null);
  const cost = costOf(body?.usage);
  if (!response.ok) throw Object.assign(new Error(`IA ${response.status}: ${String(body?.error?.message || '').slice(0, 160)}`), { cost });
  const text = (body?.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  // Cortada por el tope de tokens o rechazada: no cuenta como hecha (se reintenta en otra tanda).
  if (body?.stop_reason === 'max_tokens' || body?.stop_reason === 'refusal' || !text.trim()) throw Object.assign(new Error(`IA sin respuesta completa (${body?.stop_reason || 'vacía'})`), { cost });
  return { text, cost };
}

export async function readTraining(store) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${TRAINING_KEY}`).catch(() => []);
  const detail = rows?.[0]?.detail || {};
  return { ...DEFAULTS, days: {}, docsDone: [], groupsDone: [], counts: {}, log: [], ...detail };
}

async function saveTraining(store, state) {
  const at = new Date().toISOString();
  await store.upsert('crm_system_status', [{ key: TRAINING_KEY, ok: true, last_run_at: at, detail: { ...state, log: (state.log || []).slice(-40), groupsDone: (state.groupsDone || []).slice(-3000), docsDone: (state.docsDone || []).slice(-500) } }]);
}

async function readAll(store, path, pages = 10) {
  const out = [];
  for (let page = 0; page < pages; page += 1) {
    const rows = await store.select(`${path}&limit=1000&offset=${page * 1000}`).catch(() => []);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export function canRun(state, { today, paused = false, hasKey = true } = {}) {
  if (!hasKey) return 'falta-clave';
  if (!state.enabled) return 'apagado';
  if (paused) return 'pausa-global';
  if (state.until && today > state.until) return 'terminado';
  if ((state.days?.[today] || 0) >= Number(state.dailyBudget || 0)) return 'tope-diario';
  return '';
}

// Una tanda: hasta ~45 s. Devuelve qué hizo.
export async function trainingRun(environment = process.env, http = fetch, { now = Date.now, budgetMs = 45000 } = {}) {
  const started = now();
  const store = db(environment, http);
  const state = await readTraining(store);
  const today = arToday();
  const paused = (await readPause(environment, http)).paused;
  const blocked = canRun(state, { today, paused, hasKey: Boolean(environment.ANTHROPIC_API_KEY) });
  if (blocked) return { ok: true, skipped: blocked };
  const [questions, items, taught, docs] = await Promise.all([
    readAll(store, 'ml_questions?select=item_id,question,answer&answer=neq.&order=id'),
    readAll(store, 'ml_items?select=id,title&order=id'),
    readAll(store, 'assistant_knowledge?select=question,product&order=id'),
    store.select('technical_documents?select=id,title,product,family,extracted_text&status=eq.vigente&order=updated_at.desc&limit=200').catch(() => []),
  ]);
  const titles = Object.fromEntries(items.map((item) => [item.id, item.title]));
  const known = new Set(taught.map((row) => keyOf(row.product, row.question)));
  const rows = [];
  const add = (product, question, answer) => {
    const key = keyOf(product, question);
    if (!product || !question || !answer || known.has(key)) return false;
    known.add(key);
    rows.push({ product: String(product).slice(0, 120), question: String(question).slice(0, 300), answer: String(answer).slice(0, 600), created_by_email: TRAINER, updated_at: new Date().toISOString() });
    return true;
  };
  const counts = { ...state.counts };
  const bump = (name, by = 1) => { counts[name] = (counts[name] || 0) + by; };
  let spent = 0;
  let savedCount = 0;
  const groupsDone = new Set(state.groupsDone || []);
  const docsDone = new Set(state.docsDone || []);
  // Guarda después de cada tanda: si Vercel corta la función, no se pierde lo ya pagado.
  const flush = async (left) => {
    const chunk = rows.splice(0, rows.length);
    for (let index = 0; index < chunk.length; index += 200) await store.insert('assistant_knowledge', chunk.slice(index, index + 200));
    savedCount += chunk.length;
    const days = { ...state.days, [today]: Math.round(((state.days?.[today] || 0) + spent) * 10000) / 10000 };
    await saveTraining(store, { ...state, days, counts, groupsDone: [...groupsDone], docsDone: [...docsDone], lastRunAt: new Date().toISOString(), left });
  };
  const budgetLeft = () => Number(state.dailyBudget || 0) - (state.days?.[today] || 0) - spent;
  const timeLeft = () => budgetMs - (now() - started);

  // 1) Lo repetido 3+ veces (sin IA).
  for (const entry of suggestTeachings(questions, titles, { taught, max: 400 })) if (add(entry.product, entry.question, entry.answer)) bump('repetidas');

  // 2) Temas con respuestas distintas: la IA las junta (de a 6 en paralelo mientras haya tiempo y presupuesto).
  const groups = draftCandidates(questions, titles, { taught: [...taught, ...rows], max: 300 }).filter((group) => !groupsDone.has(group.id));
  while (groups.length && timeLeft() > CALL_MS + 2000 && budgetLeft() > 0.5) {
    const batch = groups.splice(0, 6);
    const results = await Promise.all(batch.map(async (group) => {
      try {
        const messages = buildDraftMessages({ product: group.product, topic: group.question, pairs: group.pairs });
        const { text, cost } = await claude(environment, http, { system: DRAFT_PROMPT, content: messages[0].content, maxTokens: 3000 });
        return { group, draft: parseDraft(text), cost };
      } catch (error) { return { group, error: String(error?.message || error), cost: error?.cost || 0 }; }
    }));
    for (const result of results) {
      spent += result.cost || 0;
      if (result.error) { bump('errores'); state.lastError = result.error; continue; }
      groupsDone.add(result.group.id);
      if (result.draft.state === 'clara' && add(result.group.product, result.group.question, result.draft.answer)) bump('juntadas');
      else bump(result.draft.state === 'conflicto' ? 'conflictos' : 'insuficientes');
    }
    await flush(groups.length);
  }

  // 3) Fichas técnicas: de a 3 en paralelo.
  const pending = docs.filter((doc) => !docsDone.has(doc.id) && String(doc.extracted_text || '').trim().length > 300);
  while (pending.length && timeLeft() > CALL_MS + 2000 && budgetLeft() > 0.5) {
    const batch = pending.splice(0, 3);
    const results = await Promise.all(batch.map(async (doc) => {
      try {
        const content = `FICHA: ${doc.title || ''}${doc.product ? ` · producto ${doc.product}` : ''}${doc.family ? ` · familia ${doc.family}` : ''}\n\n${String(doc.extracted_text).slice(0, 60000)}`;
        const { text, cost } = await claude(environment, http, { system: DOC_PROMPT, content, maxTokens: 6000 });
        return { doc, qa: parseDocQa(text), cost };
      } catch (error) { return { doc, error: String(error?.message || error), cost: error?.cost || 0 }; }
    }));
    for (const result of results) {
      spent += result.cost || 0;
      if (result.error) { bump('errores'); state.lastError = result.error; continue; }
      docsDone.add(result.doc.id);
      bump('fichas');
      const product = result.doc.product || result.qa.product || result.doc.title;
      for (const item of result.qa.items) if (add(product, item.question, item.answer)) bump('de-fichas');
    }
    await flush(groups.length + pending.length);
  }

  const leftWork = groups.length + pending.length;
  state.log = [...(state.log || []), { at: new Date().toISOString(), saved: savedCount + rows.length, spent: Math.round(spent * 10000) / 10000, left: leftWork }];
  state.finished = leftWork === 0 ? today : '';
  await flush(leftWork);
  return { ok: true, saved: savedCount, spent, left: leftWork };
}

export async function trainingCron(request, environment = process.env, http = fetch) {
  const result = await trainingRun(environment, http);
  return { status: 200, body: result };
}

// Panel (solo administradores): estado, prender/apagar, tope diario, «aprender ahora» y deshacer todo lo aprendido solo.
export async function trainingAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo un administrador maneja el entrenamiento.' } };
  const store = db(environment, http);
  const op = request.body?.op || 'status';
  if (op === 'set') {
    const state = await readTraining(store);
    const dailyBudget = Math.max(1, Math.min(40, Number(request.body?.dailyBudget) || state.dailyBudget));
    await saveTraining(store, { ...state, enabled: request.body?.enabled === true, dailyBudget, by: caller.email });
  }
  if (op === 'run') {
    const result = await trainingRun(environment, http, { budgetMs: 40000 });
    const state = await readTraining(store);
    return { status: 200, body: { ok: true, run: result, ...summary(state, await countLearned(store)) } };
  }
  if (op === 'undo') {
    await store.remove('assistant_knowledge', `created_by_email=eq.${TRAINER}`);
    const state = await readTraining(store);
    await saveTraining(store, { ...state, enabled: false, groupsDone: [], docsDone: [], counts: {}, undoneAt: new Date().toISOString() });
  }
  const state = await readTraining(store);
  return { status: 200, body: { ok: true, ...summary(state, await countLearned(store)) } };
}

async function countLearned(store) {
  return store.count(`assistant_knowledge?select=id&created_by_email=eq.${TRAINER}`).catch(() => null);
}

export function summary(state, learned) {
  const total = Object.values(state.days || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return { enabled: state.enabled, until: state.until, dailyBudget: state.dailyBudget, spentToday: state.days?.[arToday()] || 0, spentTotal: Math.round(total * 100) / 100, counts: state.counts || {}, learned, log: (state.log || []).slice(-8).reverse(), lastError: state.lastError || '', finished: state.finished || '' };
}
