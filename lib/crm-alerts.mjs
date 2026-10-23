// Alertas persistentes (24/10): corre después de las actualizaciones del día y también a mano (Felipe). Lee lo que ya
// se copió en la base, arma la lista (src/crm-alerts.mjs), la compara con la de ayer y la guarda en crm_alerts.
import { db } from './mercadolibre.mjs';
import { authenticatedCorporateUser } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { buildCrmAlerts, reconcile } from '../src/crm-alerts.mjs';
import { HEALTH_SOURCES } from '../src/data-health.mjs';

const PAGE = 1000;

// Trae todas las filas de a páginas (PostgREST corta en 1.000). Si la tabla todavía no existe, devuelve vacío.
async function readAll(store, table, columns, order = 'id') {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += PAGE) {
    let page;
    try { page = await store.select(`${table}?select=${columns}&order=${order}&limit=${PAGE}&offset=${offset}`); } catch { return rows; }
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// Última fecha guardada de cada fuente (una consulta corta por tabla; si la tabla no existe queda vacía).
async function latestDates(store) {
  const out = {};
  await Promise.all(HEALTH_SOURCES.map(async (source) => {
    try {
      const [row] = await store.select(`${source.table}?select=${source.column}&order=${source.column}.desc.nullslast&limit=1`);
      out[source.id] = row?.[source.column] || null;
    } catch { out[source.id] = null; }
  }));
  return out;
}

export async function refreshAlerts(environment = process.env, http = fetch, store = db(environment, http), now = Date.now()) {
  const latest = await latestDates(store);
  const [mlItems, mlMetrics, accounts, products, variants, orders, checkouts, days, statusRows, previous, competitors] = await Promise.all([
    readAll(store, 'ml_items', 'id,seller_id,sku,price,status,clips_count,pictures_count,description_length,health,available_quantity,sold_quantity,visits_30d,item_updated_at'),
    readAll(store, 'ml_account_metrics', 'seller_id,taken_on,data', 'taken_on.desc'),
    readAll(store, 'ml_accounts', 'seller_id,nickname,expires_at,last_sync_at,last_refresh_at', 'seller_id'),
    readAll(store, 'shopify_products', 'id,status,description_length,seo_title,seo_description,media_count,total_inventory'),
    readAll(store, 'shopify_variants', 'id,product_id,sku,price,inventory_quantity,inventory_policy,weight_grams'),
    readAll(store, 'shopify_orders', '*'),
    readAll(store, 'shopify_checkouts', '*'),
    readAll(store, 'shopify_daily', 'day,orders,amount', 'day'),
    readAll(store, 'crm_system_status', 'key,last_run_at,ok,detail', 'key'),
    readAll(store, 'crm_alerts', '*', 'type'),
    readAll(store, 'ml_competitor_items', 'id,seller_nickname,title,shipping_change,shipping_changed_at'),
  ]);
  const mlNames = Object.fromEntries(accounts.map((row) => [String(row.seller_id), row.nickname]));
  const alerts = buildCrmAlerts({ mlItems, mlMetrics, mlNames, products, variants, orders, checkouts, days, statusRows, competitors, latest, accounts }, now);
  const { upserts, resolved } = reconcile(previous, alerts, new Date(now).toISOString());
  await store.upsert('crm_alerts', upserts);
  for (const item of resolved) {
    await store.patch('crm_alerts', `type=eq.${encodeURIComponent(item.type)}&entity_id=eq.${encodeURIComponent(item.entity_id)}`, { resolved_at: new Date(now).toISOString() });
  }
  return { ok: true, active: upserts.length, resolved: resolved.length, high: upserts.filter((alert) => alert.severity === 'alta').length };
}

export async function alertsAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede actualizar las alertas.' } };
  try {
    return { status: 200, body: await refreshAlerts(environment, http) };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message || error).slice(0, 300) } };
  }
}

export async function alertsCron(request, environment = process.env, http = fetch) {
  try { return { status: 200, body: await refreshAlerts(environment, http) }; }
  catch (error) { return { status: 200, body: { ok: false, error: String(error?.message || error).slice(0, 300) } }; }
}
