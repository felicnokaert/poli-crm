// Poliplast App (26/11, Felipe: «quiero que el asistente siga mejorando dentro de la app»). Examen semanal automático:
// toma preguntas REALES de Mercado Libre que el equipo ya respondió, el asistente contesta sin ver la respuesta (con el
// mismo contexto que usa en el chat: ficha de la publicación, otras respuestas del equipo, guías y lo enseñado) y un
// juez la compara con la del equipo. Si falló y el equipo repitió la MISMA respuesta 2+ veces en ese tema, se guarda
// como aprendida (assistant_knowledge, created_by_email 'ia-entrenamiento', «sin revisar»: lo de Felipe siempre manda).
// Sin precios. Resultado por semana en crm_system_status key ai-exam (puntaje, por tema, lo aprendido). Costo con Haiku:
// ~US$ 0,01 por pregunta (respuesta + juez).
import { db } from './mercadolibre.mjs';
import { readPause } from './automation-pause.mjs';
import { ASSISTANT_MODEL, JUDGE_PROMPT, SYSTEM_PROMPT, buildJudgeMessages, buildMessages, parseVerdict, thinkingFor } from './assistant-ai.mjs';
import { familySiblings, pickQuestions, realAnswer, shortProduct, trainingContext, trainingQuestion } from '../src/assistant-training.mjs';
import { matchTaught } from '../src/assistant-answer.mjs';
import { arToday } from '../src/ar-date.mjs';
import { TRAINER, hasPrice } from './ai-training.mjs';

const API = 'https://api.anthropic.com/v1/messages';
export const EXAM_KEY = 'ai-exam';
const PRICE = { input: 0.10, output: 0.50 }; // Haiku 5.5, US$ por millón
const CALL_MS = 20000;

// Semana ISO (lunes) en fecha argentina: el examen de la semana junta las tandas del lunes.
export function weekOf(day = arToday()) {
  const date = new Date(`${day}T12:00:00Z`);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000);
  return monday.toISOString().slice(0, 10);
}

export function summarize(results = []) {
  const total = results.length;
  const count = (verdict) => results.filter((row) => row.verdict === verdict).length;
  const byIntent = {};
  for (const row of results) {
    const topic = row.intent || 'Otro';
    byIntent[topic] ||= { total: 0, correcta: 0 };
    byIntent[topic].total += 1;
    if (row.verdict === 'correcta') byIntent[topic].correcta += 1;
  }
  const correct = count('correcta');
  const partial = count('parcial');
  return { total, correct, partial, wrong: count('incorrecta'), noData: count('sin-dato'), pct: total ? Math.round((correct / total) * 100) : 0, useful: total ? Math.round(((correct + partial) / total) * 100) : 0, byIntent };
}

// ¿Se puede aprender la respuesta del equipo? Solo si falló, el equipo la repitió y no hay dos respuestas distintas.
export function learnable(result, team) {
  if (!['incorrecta', 'sin-dato'].includes(result.verdict)) return null;
  if (!team?.text || team.varied || team.conflict || (team.uses || 0) < 2) return null;
  if (hasPrice(team.text)) return null;
  return team.text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 600);
}

async function claude(environment, http, payload) {
  const response = await http(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({ ...payload, ...thinkingFor(payload.model, { tools: false }) }),
    signal: AbortSignal.timeout(CALL_MS),
  });
  const body = await response.json().catch(() => null);
  const usd = ((Number(body?.usage?.input_tokens) || 0) * PRICE.input + (Number(body?.usage?.output_tokens) || 0) * PRICE.output) / 1e6;
  if (!response.ok) throw Object.assign(new Error(`IA ${response.status}`), { usd });
  return { text: (body?.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim(), usd };
}

async function readAll(store, path, pages = 12) {
  const out = [];
  for (let page = 0; page < pages; page += 1) {
    const rows = await store.select(`${path}&limit=1000&offset=${page * 1000}`).catch(() => []);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function readExam(store) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${EXAM_KEY}`).catch(() => []);
  return { weeks: [], ...(rows?.[0]?.detail || {}) };
}

// Una tanda (cabe en el minuto de Vercel): `count` preguntas, de a 6 en paralelo.
export async function examRun(environment = process.env, http = fetch, { count = 18, budgetMs = 50000, now = Date.now } = {}) {
  const started = now();
  if (!environment.ANTHROPIC_API_KEY) return { ok: false, reason: 'falta-clave' };
  if ((await readPause(environment, http)).paused) return { ok: false, reason: 'pausa-global' };
  const store = db(environment, http);
  const today = arToday();
  const week = weekOf(today);
  const [questions, items, guides, taught] = await Promise.all([
    readAll(store, 'ml_questions?select=id,item_id,question,answer&order=id'),
    readAll(store, 'ml_items?select=id,title&order=id'),
    store.select('product_guides?select=id,family,product,summary,sections,status').catch(() => []),
    readAll(store, 'assistant_knowledge?select=id,question,product,answer&order=id', 3),
  ]);
  const titles = Object.fromEntries(items.map((item) => [item.id, item.title]));
  const state = await readExam(store);
  const current = state.weeks.find((entry) => entry.week === week) || { week, results: [], learned: 0, usd: 0 };
  const asked = new Set(current.results.map((row) => row.id));
  const picked = pickQuestions(questions.filter((row) => !asked.has(row.id)), titles, { count, seed: Number(week.replace(/-/g, '')) + current.results.length });
  if (!picked.length) return { ok: false, reason: 'sin-preguntas' };
  const listings = {};
  const ids = [...new Set(picked.map((row) => row.item_id))];
  if (ids.length) for (const item of await store.select(`ml_items?select=id,title,description,attributes&id=in.(${ids.map(encodeURIComponent).join(',')})`).catch(() => [])) listings[item.id] = item;
  const known = new Set(taught.map((row) => `${String(row.product).toLowerCase()}|${String(row.question).toLowerCase()}`));
  const model = environment.ASSISTANT_MODEL || ASSISTANT_MODEL;
  const results = [];
  const toLearn = [];
  let usd = 0;
  let next = 0;
  async function work(row) {
    const question = trainingQuestion(row);
    const siblings = questions.filter((other) => other.item_id === row.item_id).slice(0, 40);
    const family = familySiblings(row, questions, titles);
    const { team, context } = trainingContext(row, siblings, { guides, taught: matchTaught(taught, question), listing: listings[row.item_id] || null, family });
    let verdict = { verdict: 'sin-dato', reason: 'La IA no respondió.' };
    try {
      const answer = await claude(environment, http, { model, max_tokens: 1500, system: `${SYSTEM_PROMPT}\nHOY es ${today}.`, messages: buildMessages({ question, context }) });
      usd += answer.usd;
      if (answer.text) {
        const judged = await claude(environment, http, { model: environment.ASSISTANT_JUDGE_MODEL || model, max_tokens: 600, system: JUDGE_PROMPT, messages: buildJudgeMessages({ question, realAnswer: realAnswer(row), aiAnswer: answer.text }) });
        usd += judged.usd;
        verdict = parseVerdict(judged.text);
      }
    } catch (error) { usd += error.usd || 0; verdict = { verdict: 'error', reason: String(error.message || error).slice(0, 120) }; }
    const result = { id: row.id, intent: row.intent?.label || 'Otro', verdict: verdict.verdict, reason: String(verdict.reason || '').slice(0, 200), question: String(row.question).slice(0, 200), product: shortProduct(row.title || '') };
    const answer = learnable(result, team);
    const product = shortProduct(row.title || '') || String(row.title || '').slice(0, 80);
    const key = `${product.toLowerCase()}|${String(row.question).slice(0, 300).toLowerCase()}`;
    if (answer && product && !known.has(key)) {
      known.add(key);
      toLearn.push({ product: product.slice(0, 120), question: String(row.question).slice(0, 300), answer, created_by_email: TRAINER, updated_at: new Date().toISOString() });
      result.learned = true;
    }
    results.push(result);
  }
  await Promise.all(Array.from({ length: Math.min(6, picked.length) }, async () => {
    while (next < picked.length && now() - started < budgetMs) { const row = picked[next]; next += 1; await work(row); }
  }));
  if (toLearn.length) await store.insert('assistant_knowledge', toLearn).catch(() => {});
  const valid = results.filter((row) => row.verdict !== 'error');
  const merged = { ...current, results: [...current.results, ...valid].slice(-80), learned: (current.learned || 0) + toLearn.length, usd: Math.round(((current.usd || 0) + usd) * 1000) / 1000, at: new Date().toISOString() };
  const weeks = [...state.weeks.filter((entry) => entry.week !== week), { ...merged, summary: summarize(merged.results) }].sort((a, b) => a.week.localeCompare(b.week)).slice(-26);
  await store.upsert('crm_system_status', [{ key: EXAM_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { weeks } }]);
  return { ok: true, week, asked: results.length, errors: results.length - valid.length, learned: toLearn.length, usd: Math.round(usd * 1000) / 1000, summary: summarize(merged.results) };
}

// Lo que ve la pantalla: puntaje por semana y la última semana con sus preguntas.
export function examView(state = {}) {
  const weeks = (state.weeks || []).map((entry) => ({ week: entry.week, ...(entry.summary || summarize(entry.results || [])), learned: entry.learned || 0, usd: entry.usd || 0 }));
  const last = (state.weeks || []).slice(-1)[0];
  return { weeks, last: last ? { week: last.week, results: (last.results || []).slice(-40).reverse() } : null };
}

export async function examCron(request, environment = process.env, http = fetch) {
  return examRun(environment, http);
}

export async function examAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo administradores.' } };
  const store = db(environment, http);
  if (request.body?.op === 'run') {
    const run = await examRun(environment, http, { count: 12, budgetMs: 40000 });
    return { status: 200, body: { ok: true, run, ...examView(await readExam(store)) } };
  }
  return { status: 200, body: { ok: true, ...examView(await readExam(store)) } };
}
