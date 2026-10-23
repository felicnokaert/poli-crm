// El asistente y las alertas del día (24/10): "qué hay que atender hoy", pedidos sin despachar, carritos abandonados,
// Shopify y TACoS. Lee lo que ya dejó el servidor en crm_alerts (no calcula nada nuevo) y se lo pasa a la IA como contexto.
import { SEVERITY_LABEL, groupAlerts } from './crm-alerts.mjs';
import { plain } from './knowledge-search.mjs';

const ASK = /\b(atender|atencion|alertas?|urgente\w*|pendientes? de hoy|plan del dia|sin despachar|sin entregar|retiros?|carritos?|abandonad\w*|shopify|tienda online|tacos|publicidad|ads|embudo|pedidos? (atrasad\w*|pendientes?))\b/;
export const asksOps = (query) => ASK.test(plain(query));
const TACOS = /\b(tacos|publicidad|ads|inversion en publicidad|gaste en publicidad|gastamos en publicidad)\b/;
export const asksTacos = (query) => TACOS.test(plain(query));

// Texto para la IA. Si no hay alertas guardadas lo dice (no inventa que "no hay nada").
export function opsContext(rows = [], { tacos = false, now = Date.now() } = {}) {
  const groups = groupAlerts(rows, now);
  const lines = ['ALERTAS DEL CRM (las arma el servidor todos los días; solo avisan, nada se cambia solo):'];
  if (!groups.total) lines.push('- No hay alertas guardadas: puede que no haya nada urgente o que todavía no se haya generado la primera lista (Centro de mejoras → Actualizar).');
  for (const severity of ['alta', 'media', 'baja']) {
    for (const alert of groups[severity].slice(0, 12)) lines.push(`- ${SEVERITY_LABEL[severity]}: ${alert.title}${alert.days >= 1 ? ` (hace ${alert.days} días)` : ''}${alert.detail ? `. ${alert.detail}` : ''}`);
    if (groups[severity].length > 12) lines.push(`- …y ${groups[severity].length - 12} más de nivel ${SEVERITY_LABEL[severity].toLowerCase()}.`);
  }
  if (tacos) lines.push('TACoS: la API de Publicidad de Mercado Libre NO está conectada. Solo se estima si Felipe pegó la tabla de campañas en Ventas → Mercado Libre → Dinero → Publicidad; si no, figura "sin datos" (no es 0). Nunca inventes un porcentaje.');
  return lines.join('\n');
}
