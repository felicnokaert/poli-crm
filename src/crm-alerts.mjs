// Alertas persistentes del CRM (24/10). Junta lo que ya se calcula por separado (Mercado Libre, Shopify, actualizaciones
// automáticas) en una sola lista con gravedad, y la compara con la de ayer para saber desde cuándo dura cada una.
// Solo avisa: no cambia nada en ningún canal. Reglas de autonomía de Felipe: precios, pausas y activaciones se aprueban a mano.
import { buildAlerts as mlSummaryAlerts, latestBySeller } from './ml-summary.mjs';
import { boardRows, periodTotals, summarize, issueLabel } from './shopify-board.mjs';
import { pendingOrders, recoverList } from './shopify-operation.mjs';
import { priceCross, priceSummary } from './shopify-prices.mjs';
import { integrationsStatus, needsAttention } from './integrations-status.mjs';
import { evaluate, HEALTH_SOURCES, ageText } from './data-health.mjs';
import { recentShippingChanges } from './ml-shipping-change.mjs';

export const SEVERITY = { alta: 0, media: 1, baja: 2 };
export const SEVERITY_LABEL = { alta: 'Urgente', media: 'Importante', baja: 'Para mejorar' };

const money = (value) => Math.round(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const argentinaDay = (now) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);

// Las de Mercado Libre vienen de ml-summary (mismas reglas que el Resumen): urgentes = alta, consejos = baja.
function mlAlerts({ mlItems, mlMetrics, mlNames }) {
  const metricsBySeller = Object.fromEntries(Object.entries(latestBySeller(mlMetrics)).map(([seller, row]) => [seller, row.data]));
  const nickname = mlNames || {};
  return mlSummaryAlerts({ metricsBySeller, items: mlItems, nickname }).map((alert) => ({
    type: `ml-${alert.key}`, entity_id: '', source: 'ml',
    severity: alert.level === 'urgent' ? 'alta' : 'baja',
    title: alert.text, detail: alert.detail || '',
    link: { view: 'mercadolibre', issue: alert.issue || '' },
  }));
}

// Un competidor cambió de envío en los últimos 7 días (pasó a Full o a envío gratis): puede afectar nuestra posición.
function competitorShippingAlerts(rows, now) {
  return recentShippingChanges(rows, now).map((row) => ({
    type: 'ml-envio-competidor', entity_id: row.id, source: 'ml', severity: 'media',
    title: `${row.seller_nickname || 'Un competidor'} ${row.shipping_change}${row.title ? `: ${String(row.title).slice(0, 60)}` : ''}`,
    detail: 'Un envío mejor suele mejorar su posición y sus ventas. Mirá si conviene igualarlo.', link: { view: 'mercadolibre' },
  }));
}

function shopifyAlerts({ products, variants, orders, checkouts, days, now, mlItems = [] }) {
  const out = [];
  // Regla de precios: Shopify = Mercado Libre − 10 % (solo avisa cuántos productos activos se salieron).
  const prices = priceSummary(priceCross({ products, variants, mlItems }));
  if (prices.toChangeActive > 0) {
    out.push({
      type: 'shopify-precio-ml', entity_id: '', source: 'shopify', severity: prices.toChangeActive >= 10 ? 'media' : 'baja',
      title: `${prices.toChangeActive} variantes activas de Shopify fuera de la regla de precio (ML −10 %)`,
      detail: `${prices.lower} para bajar y ${prices.raise} para subir. La propuesta está en Shopify → Precios vs ML.`, link: { view: 'shopify', tab: 'precios' },
    });
  }
  for (const order of pendingOrders(orders, now)) {
    const late = order.kind === 'retiro' ? `retiro sin retirar hace ${order.days} días` : order.hours >= 48 ? `sin despachar hace ${order.days} días` : `sin despachar hace ${order.hours} h`;
    out.push({
      type: 'shopify-pedido', entity_id: order.id, source: 'shopify',
      severity: 'baja', // 26/10 (Felipe): Brenda ve y despacha los pedidos; no son trabajo de Felipe ni van al plan del día
      title: `Pedido ${order.name}: ${late}`, detail: `Pagado, ${money(order.total || 0)}. Los pedidos los atiende Brenda; acá solo se ven.`,
      link: { view: 'shopify', tab: 'operacion' },
    });
  }
  const recover = recoverList(checkouts, 999);
  if (recover.length) {
    const total = recover.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    out.push({
      type: 'shopify-carritos', entity_id: '', source: 'shopify', severity: total >= 100000 ? 'media' : 'baja',
      title: `${recover.length} carrito${recover.length === 1 ? '' : 's'} abandonado${recover.length === 1 ? '' : 's'} por ${money(total)}`,
      detail: 'Son compras que se frenaron al pagar. Conviene recuperar las más grandes.', link: { view: 'shopify', tab: 'operacion' },
    });
  }
  const rows = boardRows(products, variants);
  const counts = summarize(rows).issueCounts;
  const rules = [['precio_cero', 'alta'], ['stock_cero', 'media'], ['sku_repetido', 'media'], ['sin_foto', 'baja'], ['sin_descripcion', 'baja'], ['sin_peso', 'baja']];
  for (const [key, severity] of rules) {
    if (!counts[key]) continue;
    out.push({
      type: `shopify-${key}`, entity_id: '', source: 'shopify', severity,
      title: `${counts[key]} producto${counts[key] === 1 ? '' : 's'} de Shopify · ${issueLabel(key).toLowerCase()}`, detail: 'Solo productos activos.',
      link: { view: 'shopify', tab: 'productos', issue: key },
    });
  }
  const week = periodTotals(days, 7, argentinaDay(now));
  if (week.previous.amount > 0 && week.amountChange !== null && week.amountChange <= -0.2) {
    out.push({
      type: 'shopify-caida', entity_id: '', source: 'shopify', severity: 'alta',
      title: `Ventas de Shopify: ${money(week.current.amount)} en 7 días (${Math.round(week.amountChange * 100)} % contra la semana anterior)`,
      detail: 'Puede ser una semana floja o un problema en el pago: mirá el embudo en Operación.', link: { view: 'shopify', tab: 'operacion' },
    });
  }
  return out;
}

function integrationAlerts(statusRows, now) {
  return needsAttention(integrationsStatus(statusRows, { now })).map((entry) => ({
    type: 'integracion', entity_id: entry.key, source: 'sistema', severity: 'alta',
    title: `${entry.name}: ${entry.label}`, detail: entry.problems?.[0] || 'Los datos de ese canal pueden estar viejos.', link: { view: 'settings', section: 'conexiones' },
  }));
}

// Datos viejos (24/10): la última fecha de cada fuente contra su plazo (mismo criterio que Más → Datos → Conexiones).
// `latest` = { [id de fuente]: última fecha guardada }. Atrasada = media; muy atrasada = alta. Sin datos no se avisa (puede no estar configurada).
export function staleAlerts(latest = {}, now = Date.now()) {
  return HEALTH_SOURCES.flatMap((source) => {
    const result = evaluate({ at: latest[source.id] || null, maxHours: source.maxHours, dateOnly: source.dateOnly, optional: source.optional }, now);
    if (result.status !== 'late' && result.status !== 'old') return [];
    return [{
      type: 'datos-atrasados', entity_id: source.id, source: 'sistema', severity: result.status === 'old' ? 'alta' : 'media',
      title: `${source.group} · ${source.label}: sin actualizar hace ${ageText(result.ageHours)}`,
      detail: 'Los números de esta fuente pueden estar viejos. Revisá Más → Datos → Conexiones y apretá su botón de actualizar.', link: { view: 'settings', section: 'conexiones' },
    }];
  });
}

// Cuentas de Mercado Libre que dejaron de renovar el acceso: si hace más de 3 días que no se sincroniza, el permiso venció o se
// revocó y hay que reconectarla (Más → Datos → Mercado Libre). El token dura 6 horas pero se renueva solo mientras la cuenta anda.
export function tokenAlerts(accounts = [], now = Date.now()) {
  return accounts.flatMap((account) => {
    const last = Math.max(Date.parse(account.last_sync_at || '') || 0, Date.parse(account.last_refresh_at || '') || 0);
    const stale = !last || now - last > 3 * 24 * 3600 * 1000;
    const expired = Date.parse(account.expires_at || '') < now - 24 * 3600 * 1000;
    if (!(stale && expired)) return [];
    return [{
      type: 'ml-token', entity_id: String(account.seller_id), source: 'mercadolibre', severity: 'alta',
      title: `Mercado Libre · ${account.nickname || account.seller_id}: hay que reconectar la cuenta`,
      detail: 'El acceso venció y no se pudo renovar. Más → Datos → Mercado Libre → Conectar de nuevo (si no, se deja de actualizar).', link: { view: 'settings', section: 'mercadolibre' },
    }];
  });
}

// Todas las alertas de hoy, ordenadas por gravedad. `data` trae lo leído de la base (ver lib/crm-alerts.mjs).
export function buildCrmAlerts(data = {}, now = Date.now()) {
  const list = [
    ...integrationAlerts(data.statusRows || [], now),
    ...staleAlerts(data.latest || {}, now),
    ...tokenAlerts(data.accounts || [], now),
    ...mlAlerts({ mlItems: data.mlItems || [], mlMetrics: data.mlMetrics || [], mlNames: data.mlNames }),
    ...competitorShippingAlerts(data.competitors || [], now),
    ...shopifyAlerts({ products: data.products || [], variants: data.variants || [], orders: data.orders || [], checkouts: data.checkouts || [], days: data.days || [], now, mlItems: data.mlItems || [] }),
  ];
  return list.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);
}

// Compara con lo guardado: las que siguen suman un día más, las nuevas arrancan hoy y las que ya no están se dan por resueltas.
export function reconcile(previous = [], next = [], nowISO = new Date().toISOString()) {
  const open = new Map(previous.filter((row) => !row.resolved_at).map((row) => [`${row.type}|${row.entity_id}`, row]));
  const upserts = next.map((alert) => {
    const before = open.get(`${alert.type}|${alert.entity_id}`);
    return { ...alert, link: alert.link || {}, first_seen: before?.first_seen || nowISO, last_seen: nowISO, runs_active: (before?.runs_active || 0) + 1, resolved_at: null };
  });
  const current = new Set(next.map((alert) => `${alert.type}|${alert.entity_id}`));
  const resolved = [...open.values()].filter((row) => !current.has(`${row.type}|${row.entity_id}`)).map((row) => ({ type: row.type, entity_id: row.entity_id }));
  return { upserts, resolved };
}

// Para el panel: agrupa por gravedad y calcula hace cuántos días está cada una.
export function groupAlerts(rows = [], now = Date.now()) {
  const open = rows.filter((row) => !row.resolved_at).map((row) => ({ ...row, days: Math.max(0, Math.floor((now - Date.parse(row.first_seen)) / 86400000)) }));
  const by = (severity) => open.filter((row) => row.severity === severity).sort((a, b) => b.days - a.days || a.title.localeCompare(b.title, 'es'));
  return { alta: by('alta'), media: by('media'), baja: by('baja'), total: open.length };
}
