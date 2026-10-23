// Calidad y experiencia de compra de cada publicación (23/10, Felipe: "que el panel funcione mejor que
// Administrado y Real Trends juntos y sepa más que el mismo Mercado Libre"). Dos recursos oficiales de ML,
// solo lectura:
//  - GET /item/{id}/performance → puntaje de calidad (0-100), nivel (Básica / Estándar / Profesional) y las
//    reglas que faltan cumplir, cada una con su acción ("Agregar fotos") y link para editarla.
//  - GET /reputation/items/{id}/purchase_experience/integrators → experiencia de compra (color, puntaje y
//    los problemas: reclamos, cancelaciones, demoras) con lo que recomienda hacer.
// La documentación no se pudo leer completa: se lee con tolerancia y se guarda la respuesta original (raw)
// para ajustar después. Se guarda en ml_item_health (migración 20261023_ml_item_health.sql).
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const text = (value) => (typeof value === 'string' ? value : value?.text || value?.title || value?.label || '');
const DONE = /^(completed?|done|ok|achieved|success)$/i;

function collectRules(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((child) => collectRules(child, out)); return out; }
  if (Array.isArray(node.rules)) {
    for (const rule of node.rules) {
      const progress = num(rule?.progress);
      if (DONE.test(String(rule?.status || '')) || progress === 1) continue;
      const wordings = rule?.wordings || {};
      out.push({ key: String(rule?.key || ''), title: text(wordings.title) || String(rule?.key || ''), label: text(wordings.label), link: String(wordings.link || ''), progress, group: text(node.title) || String(node.key || '') });
    }
  }
  for (const key of ['buckets', 'variables', 'children']) if (Array.isArray(node[key])) collectRules(node[key], out);
  return out;
}

export function qualityFields(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    quality_score: num(body.score),
    quality_level: String(body.level_wording || body.level || ''),
    quality_pending: collectRules(body.buckets || body).slice(0, 15),
  };
}

export function experienceFields(body) {
  if (!body || typeof body !== 'object') return {};
  const reputation = body.reputation || {};
  const problems = Array.isArray(body.metrics_details?.problems) ? body.metrics_details.problems : [];
  return {
    px_color: String(reputation.color || ''),
    px_score: num(reputation.value ?? reputation.score),
    px_label: text(reputation.text || reputation.label || body.status),
    px_problems: problems.slice(0, 8).map((problem) => ({
      title: text(problem.title) || text(problem.tag) || String(problem.key || ''),
      remedy: text(problem.remedy) || text(problem.level?.remedy) || text(problem.solution),
      quantity: num(problem.quantity ?? problem.count),
      color: String(problem.color || problem.level?.color || ''),
    })),
  };
}

const clipRaw = (body) => { try { const json = JSON.stringify(body ?? null); return json.length > 8000 ? null : JSON.parse(json); } catch { return null; } };
const refused = (message) => /unauthori[sz]ed|forbidden|401|403|not allowed|invalid scope/i.test(message);

// De a una publicación, con pausa y tiempo límite (como las visitas). Si ML niega el permiso en las primeras
// 3, corta y lo avisa en vez de seguir pidiendo.
export async function itemHealth(account, token, ids, { get, store, now = Date.now, deadline = Date.now() + 30000, pause = 300, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const rows = [];
  const problems = new Map();
  const note = (label) => problems.set(label, (problems.get(label) || 0) + 1);
  let denied = 0;
  for (const id of ids) {
    if (now() > deadline) break;
    const row = { id, seller_id: String(account.seller_id), checked_at: new Date(now()).toISOString() };
    let any = false;
    try {
      const body = await get(`/item/${id}/performance`, token);
      Object.assign(row, qualityFields(body), { raw_quality: clipRaw(body) });
      any = true;
    } catch (error) {
      const message = String(error?.message || error);
      if (refused(message)) denied += 1;
      note(refused(message) ? 'calidad: Mercado Libre no da permiso' : `calidad: ${message.slice(0, 80)}`);
    }
    try {
      const body = await get(`/reputation/items/${id}/purchase_experience/integrators?locale=es_AR`, token);
      Object.assign(row, experienceFields(body), { raw_px: clipRaw(body) });
      any = true;
    } catch (error) {
      const message = String(error?.message || error);
      if (refused(message)) denied += 1;
      note(refused(message) ? 'experiencia de compra: Mercado Libre no da permiso' : `experiencia de compra: ${message.slice(0, 80)}`);
    }
    if (any) rows.push(row);
    if (!rows.length && denied >= 6) break;
    if (pause) await wait(pause);
  }
  // Las filas de una tanda tienen que tener las mismas columnas.
  const columns = ['quality_score', 'quality_level', 'quality_pending', 'raw_quality', 'px_color', 'px_score', 'px_label', 'px_problems', 'raw_px'];
  const full = rows.map((row) => Object.fromEntries([...Object.keys(row), ...columns].map((key) => [key, row[key] ?? (/pending|problems/.test(key) ? [] : null)])));
  if (full.length) await store.upsert('ml_item_health', full);
  return { saved: full.length, tried: ids.length, errors: [...problems].map(([label, count]) => `${label} (${count})`) };
}
