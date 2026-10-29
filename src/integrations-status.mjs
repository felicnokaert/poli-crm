// Estado de las actualizaciones automáticas de cada día (23/10). Lo escribe el servidor en crm_system_status
// (lib/integration-crons.mjs, key integration:<nombre>; el mantenimiento usa 'daily-maintenance').
// Horarios en hora argentina (vercel.json está en UTC: 09:30 UTC = 06:30 AR).
export const INTEGRATIONS = [
  { key: 'daily-maintenance', name: 'Mantenimiento (tareas automáticas y respaldo)', when: '03:00' },
  { key: 'integration:mercadolibre-1', name: 'Mercado Libre: publicaciones, preguntas, visitas y calidad (1.ª cuenta)', when: '06:30' },
  { key: 'integration:mercadolibre-2', name: 'Mercado Libre: publicaciones, preguntas, visitas y calidad (2.ª cuenta)', when: '06:35' },
  { key: 'integration:mercadolibre-3', name: 'Mercado Libre: publicaciones, preguntas, visitas y calidad (3.ª cuenta)', when: '06:45' },
  { key: 'integration:mercadolibre-ventas-1', name: 'Mercado Libre: resumen de ventas (1.ª cuenta)', when: '06:40' },
  { key: 'integration:mercadolibre-ventas-2', name: 'Mercado Libre: resumen de ventas (2.ª cuenta)', when: '06:50' },
  { key: 'integration:mercadolibre-ventas-3', name: 'Mercado Libre: resumen de ventas (3.ª cuenta)', when: '08:00' },
  { key: 'integration:contabilium', name: 'Contabilium: comprobantes y fichas de clientes', when: '07:00' },
  { key: 'integration:shopify', name: 'Shopify: productos y pedidos', when: '07:30' },
  { key: 'integration:alertas', name: 'Alertas de Qué atender hoy', when: '08:45' },
  { key: 'integration:mercadolibre-publicidad', name: 'Mercado Libre: inversión en Publicidad (TACoS)', when: '08:30' },
  { key: 'integration:mercadolibre-mercado', name: 'Mercado Libre: competencia por catálogo y tendencias', when: '08:15' },
];
// Vercel puede correr un cron hasta una hora tarde: se da por vencido a las 26 h.
const STALE_HOURS = 26;
// Si quedó "corriendo" más de 5 minutos, Vercel la cortó (límite de 60 s).
const CUT_MINUTES = 5;

export function integrationsStatus(rows = [], { now = Date.now() } = {}) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return INTEGRATIONS.map((integration) => {
    const row = byKey.get(integration.key);
    if (!row?.last_run_at) return { ...integration, state: 'never', label: 'Todavía no corrió', problems: [] };
    const at = Date.parse(row.last_run_at);
    const hours = (now - at) / 3600000;
    const detail = row.detail || {};
    const problems = Array.isArray(detail.problems) ? detail.problems.filter(Boolean) : [];
    const base = { ...integration, at: row.last_run_at, hours, seconds: detail.seconds ?? null, problems, skipped: detail.skipped || null };
    if (detail.running) {
      return (now - at) / 60000 > CUT_MINUTES
        ? { ...base, state: 'cut', label: 'Se cortó a mitad (pasó el minuto que da Vercel)' }
        : { ...base, state: 'running', label: 'Corriendo ahora' };
    }
    if (hours > STALE_HOURS) return { ...base, state: 'stale', label: `No corre hace ${Math.round(hours / 24) || 1} día(s)` };
    if (row.ok === false) return { ...base, state: 'failed', label: 'Falló' };
    if (base.skipped) return { ...base, state: 'skipped', label: `No corrió: ${base.skipped}` };
    return { ...base, state: problems.length ? 'partial' : 'ok', label: problems.length ? 'Anduvo, con avisos' : 'Anduvo bien' };
  });
}

// Lo que hay que mirar (para el aviso de Inicio): falló, se cortó o no corre. "Nunca corrió" se ve solo en Datos
// (recién publicada, la constancia aparece después de la primera mañana).
export const needsAttention = (list = []) => list.filter((entry) => ['failed', 'cut', 'stale', 'skipped'].includes(entry.state));
