// Lectura diaria de Publicidad (Product Ads) de Mercado Libre (24/10): la inversión de cada cuenta en los últimos 30 días, para
// que el TACoS se calcule solo en vez de depender de la tabla que Felipe pega. SOLO LEE de Mercado Libre; guarda una foto por
// cuenta en crm_system_status (key ml-ads:<seller_id>). Los caminos y campos son los de la prueba de conexión (ml-ads-probe.mjs,
// verde en las 3 cuentas el 24/10); como no se vio la forma exacta de la respuesta, el lector es tolerante y deja las claves de
// la primera fila (sampleKeys) para ajustarlo si hiciera falta.
const API = 'https://api.mercadolibre.com';
export const ADS_KEY_PREFIX = 'ml-ads:';
const PAGE = 50;
const MAX_PAGES = 6;

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const ymd = (date) => date.toISOString().slice(0, 10);

async function call(http, path, token, version) {
  try {
    const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Api-Version': version }, signal: AbortSignal.timeout(12000) });
    const text = await response.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch { /* texto plano */ }
    return { status: response.status, ok: response.ok, json, text: text.slice(0, 160) };
  } catch (error) {
    return { status: 0, ok: false, json: null, text: String(error?.message || error).slice(0, 160) };
  }
}

// Una fila de campaña: las métricas pueden venir dentro de `metrics` o sueltas.
export function campaignRow(row = {}) {
  const m = row.metrics && typeof row.metrics === 'object' ? row.metrics : row;
  const cost = number(m.cost);
  const revenue = number(m.total_amount ?? (number(m.direct_amount) + number(m.indirect_amount)));
  return {
    id: String(row.id ?? row.campaign_id ?? ''),
    name: String(row.name ?? row.campaign_name ?? row.id ?? '').slice(0, 120),
    status: String(row.status ?? ''),
    cost, revenue,
    clicks: number(m.clicks), prints: number(m.prints),
    acos: revenue > 0 ? cost / revenue : null,
  };
}

export function summarizeCampaigns(rows = []) {
  const campaigns = rows.map(campaignRow);
  const spend = campaigns.reduce((sum, c) => sum + c.cost, 0);
  const revenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
  return {
    spend: Math.round(spend * 100) / 100,
    adsRevenue: Math.round(revenue * 100) / 100,
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    prints: campaigns.reduce((sum, c) => sum + c.prints, 0),
    campaigns: campaigns.sort((a, b) => b.cost - a.cost).slice(0, 15),
    count: campaigns.length,
  };
}

// accounts: filas de ml_accounts. Devuelve un resultado por cuenta y guarda la foto de las que salieron bien.
export async function refreshAds(accounts = [], { http = fetch, tokenFor, store, now = Date.now(), deadline = Infinity } = {}) {
  const to = new Date(now);
  const from = new Date(now - 29 * 86400000);
  const results = [];
  for (const account of accounts) {
    const label = account.nickname || String(account.seller_id);
    if (Date.now() > deadline) { results.push({ name: label, ok: false, error: 'No alcanzó el tiempo: quedó para la próxima.' }); continue; }
    try {
      const token = await tokenFor(account);
      const advertisers = await call(http, '/advertising/advertisers?product_id=PADS', token, '1');
      if (!advertisers.ok) throw new Error(`anunciante: ${advertisers.status} ${advertisers.text}`);
      const list = advertisers.json?.advertisers || advertisers.json?.results || (Array.isArray(advertisers.json) ? advertisers.json : []);
      const advertiserId = list[0]?.advertiser_id || list[0]?.id;
      if (!advertiserId) throw new Error('la cuenta no tiene anunciante de Product Ads');
      const rows = [];
      let firstKeys = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const campaigns = await call(http, `/advertising/MLA/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/search?date_from=${ymd(from)}&date_to=${ymd(to)}&metrics=clicks,prints,cost,direct_amount,indirect_amount,total_amount&limit=${PAGE}&offset=${page * PAGE}`, token, '2');
        if (!campaigns.ok) throw new Error(`campañas: ${campaigns.status} ${campaigns.text}`);
        const batch = campaigns.json?.results || [];
        if (page === 0 && batch[0]) firstKeys = Object.keys(batch[0]).slice(0, 20);
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      const summary = summarizeCampaigns(rows);
      const detail = { sellerId: String(account.seller_id), nickname: label, from: ymd(from), to: ymd(to), fetchedAt: new Date(now).toISOString(), ...summary, sampleKeys: firstKeys };
      if (store) await store.upsert('crm_system_status', [{ key: `${ADS_KEY_PREFIX}${account.seller_id}`, ok: true, detail, last_run_at: detail.fetchedAt }]);
      results.push({ name: label, ok: true, spend: summary.spend, campaigns: summary.count });
    } catch (error) {
      results.push({ name: label, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  return results;
}
