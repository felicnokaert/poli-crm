// Prueba de conexión de Publicidad (Product Ads) de Mercado Libre (24/10). SOLO LEE y no guarda nada: sirve para saber, apenas
// se activa el permiso de Publicidad y se reconectan las cuentas, qué responde Mercado Libre antes de armar el TACoS en vivo.
// Los caminos salen de la documentación pública de Product Ads (no se pudo leer desde acá): si alguno cambió, el resultado lo muestra.
const API = 'https://api.mercadolibre.com';

async function call(http, path, token, headers = {}) {
  try {
    const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000) });
    const text = await response.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch { /* texto plano */ }
    return { status: response.status, ok: response.ok, json, text: text.slice(0, 160) };
  } catch (error) {
    return { status: 0, ok: false, json: null, text: String(error?.message || error).slice(0, 160) };
  }
}

const ymd = (date) => date.toISOString().slice(0, 10);
const step = (name, result, detail) => ({ name, status: result.status, ok: result.ok, detail: detail || (result.ok ? 'ok' : result.text) });

// accounts: filas de ml_accounts con token vigente (ver freshToken).
export async function probeAds(accounts = [], { http = fetch, tokenFor, now = Date.now() } = {}) {
  const out = [];
  const to = new Date(now);
  const from = new Date(now - 29 * 86400000);
  for (const account of accounts) {
    const label = account.nickname || String(account.seller_id);
    let token;
    try { token = await tokenFor(account); } catch (error) { out.push({ name: `${label}: token`, status: 0, ok: false, detail: String(error?.message || error).slice(0, 120) }); continue; }
    const advertisers = await call(http, '/advertising/advertisers?product_id=PADS', token, { 'Api-Version': '1' });
    const list = advertisers.json?.advertisers || advertisers.json?.results || (Array.isArray(advertisers.json) ? advertisers.json : []);
    out.push(step(`${label}: anunciante de Product Ads`, advertisers, advertisers.ok ? `${list.length} anunciante(s)` : undefined));
    const advertiserId = list[0]?.advertiser_id || list[0]?.id;
    if (!advertiserId) continue;
    const campaigns = await call(http, `/advertising/MLA/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/search?date_from=${ymd(from)}&date_to=${ymd(to)}&metrics=clicks,prints,cost,direct_amount,indirect_amount,total_amount&limit=5`, token, { 'Api-Version': '2' });
    const rows = campaigns.json?.results || [];
    out.push(step(`${label}: campañas y métricas (30 días)`, campaigns, campaigns.ok ? `${rows.length} campaña(s) en la muestra` : undefined));
  }
  return out;
}
