// Salud de las conexiones (24/10): cuándo se actualizó por última vez cada fuente de datos y si ya se pasó de lo esperable.
// Las fuentes con cron diario se esperan cada 36 h (un día más margen); la calidad de ML se revisa por tandas, cada semana.
export const HOUR = 3600 * 1000;

// table/column: de dónde sale la última fecha; dateOnly: la columna trae solo el día (no la hora).
export const HEALTH_SOURCES = [
  { id: 'ml-items', group: 'Mercado Libre', label: 'Publicaciones', table: 'ml_items', column: 'synced_at', maxHours: 36 },
  { id: 'ml-metrics', group: 'Mercado Libre', label: 'Resumen de ventas y visitas', table: 'ml_account_metrics', column: 'taken_at', maxHours: 36 },
  { id: 'ml-health', group: 'Mercado Libre', label: 'Calidad y experiencia de compra', table: 'ml_item_health', column: 'checked_at', maxHours: 8 * 24 },
  { id: 'ml-economics', group: 'Mercado Libre', label: 'Stock y ganancia', table: 'ml_item_economics', column: 'updated_at', maxHours: 36 },
  { id: 'ml-competition', group: 'Mercado Libre', label: 'Competencia', table: 'ml_competitor_items', column: 'checked_at', maxHours: 36, optional: true },
  { id: 'ml-trends', group: 'Mercado Libre', label: 'Tendencias', table: 'ml_trends', column: 'taken_on', dateOnly: true, maxHours: 60 },
  { id: 'shopify-products', group: 'Shopify', label: 'Productos', table: 'shopify_products', column: 'synced_at', maxHours: 36 },
  { id: 'shopify-orders', group: 'Shopify', label: 'Pedidos', table: 'shopify_daily', column: 'synced_at', maxHours: 36 },
  { id: 'contabilium-invoices', group: 'Contabilium', label: 'Comprobantes (todas las empresas)', table: 'contabilium_comprobantes', column: 'synced_at', maxHours: 36 },
  { id: 'contabilium-clients', group: 'Contabilium', label: 'Fichas de clientes', table: 'contabilium_clientes', column: 'synced_at', maxHours: 24 * 14, note: 'Solo se actualiza cuando faltan fichas.' },
];

const toTime = (value, dateOnly) => {
  if (!value) return null;
  const time = Date.parse(dateOnly ? `${String(value).slice(0, 10)}T12:00:00-03:00` : value);
  return Number.isFinite(time) ? time : null;
};

// Estado de una fuente: ok / late (pasó el plazo) / old (más del triple) / empty (sin datos) / error.
export function evaluate({ at = null, count = 0, error = '', maxHours = 36, dateOnly = false, optional = false }, now = Date.now()) {
  if (error) return { status: 'error', ageHours: null, text: `Falló la última corrida: ${String(error).slice(0, 140)}` };
  const time = toTime(at, dateOnly);
  if (time === null) return { status: optional ? 'idle' : 'empty', ageHours: null, text: optional ? 'Todavía no se configuró.' : 'Todavía no hay datos.' };
  const ageHours = Math.max(0, (now - time) / HOUR);
  const status = ageHours > maxHours * 3 ? 'old' : ageHours > maxHours ? 'late' : 'ok';
  return { status, ageHours, text: ageText(ageHours), count };
}

export function ageText(hours) {
  if (hours < 1) return 'hace minutos';
  if (hours < 36) return `hace ${Math.round(hours)} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

export const STATUS_LABEL = { ok: 'Al día', late: 'Atrasada', old: 'Muy atrasada', empty: 'Sin datos', error: 'Con error', idle: 'Sin configurar' };

// Resumen para el encabezado: cuántas fuentes necesitan atención.
export function healthSummary(rows = []) {
  const bad = rows.filter((row) => ['late', 'old', 'error', 'empty'].includes(row.status));
  return { total: rows.length, attention: bad.length, worst: bad.find((row) => row.status === 'error' || row.status === 'old') || bad[0] || null };
}

// Filas de Contabilium por empresa (tabla contabilium_sync): última corrida, error y si el historial terminó.
export function contabiliumRows(syncRows = [], now = Date.now()) {
  return syncRows.map((row) => {
    const isClients = String(row.company).endsWith(':clientes');
    const base = evaluate({ at: row.last_run_at, error: row.last_error, maxHours: isClients ? 24 * 14 : 36 }, now);
    const detail = isClients ? 'fichas' : row.history_done ? 'historial completo' : 'copiando el historial';
    return { id: `contabilium-sync-${row.company}`, group: 'Contabilium', label: `${String(row.company).replace(':clientes', '')} · ${detail}`, ...base, count: row.total_saved ?? 0 };
  });
}

// Cuentas de Mercado Libre: última sincronización y último refresco de visitas.
export function mlAccountRows(accounts = [], now = Date.now()) {
  return accounts.flatMap((account) => [
    { id: `ml-sync-${account.seller_id}`, group: 'Mercado Libre', label: `${account.nickname || account.seller_id} · publicaciones`, ...evaluate({ at: account.last_sync_at, maxHours: 36 }, now) },
    { id: `ml-refresh-${account.seller_id}`, group: 'Mercado Libre', label: `${account.nickname || account.seller_id} · visitas y calidad`, ...evaluate({ at: account.last_refresh_at, maxHours: 36 }, now) },
  ]);
}
