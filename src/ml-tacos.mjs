// TACoS de Mercado Libre (24/10, Felipe: "que quede visible con un estado claro en vez de que no aparezca").
// TACoS = inversión en publicidad ÷ ventas TOTALES de la cuenta (no solo las de publicidad). La API de Publicidad todavía no
// está conectada: la inversión sale de la tabla que Felipe pega en Dinero → Publicidad (Inversión 30 días). Mientras no haya
// datos, el estado dice "sin datos", nunca 0 %. Si lo pegado tiene más de 10 días, se marca desactualizado.
export const TACOS_TARGET = 0.17;
export const STALE_DAYS = 10;

export const TACOS_STATE = {
  'sin-datos': 'Sin datos · falta conectar la API de Publicidad de Mercado Libre',
  'sin-ventas': 'Sin ventas leídas todavía: actualizá el resumen',
  estimado: 'Estimado con la tabla de campañas pegada',
  desactualizado: 'Desactualizado: volvé a pegar la tabla de campañas',
};

// sales30: ventas de la cuenta en 30 días (o null si no se leyeron). report: lo guardado en Publicidad para esa cuenta.
export function tacosFor({ sales30 = null, report = null, now = Date.now() } = {}) {
  const spend = Number(report?.summary?.spend);
  if (!report || !(spend >= 0) || report.summary?.spend == null) return { state: 'sin-datos', tacos: null, spend: null, sales: sales30 };
  const ageDays = report.savedAt ? Math.max(0, Math.floor((now - Date.parse(report.savedAt)) / 86400000)) : null;
  if (!(sales30 > 0)) return { state: 'sin-ventas', tacos: null, spend, sales: sales30, ageDays };
  const tacos = spend / sales30;
  return { state: ageDays !== null && ageDays > STALE_DAYS ? 'desactualizado' : 'estimado', tacos, spend, sales: sales30, ageDays, high: tacos > TACOS_TARGET };
}
