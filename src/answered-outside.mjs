// Cuando alguien contesta un WhatsApp desde el teléfono (no desde el CRM),
// no hay ningún evento "outbound" con contenido -Meta no lo entrega-, pero
// sí llegan confirmaciones de status (sent/delivered/read/played) del lado
// del cliente para lo que se le mandó. Si existe una de esas confirmaciones
// posterior al último mensaje entrante de ese contacto, es evidencia fuerte
// de que ya se le respondió fuera del CRM.
export function wasAnsweredOutside(latestInboundAt, customerWaId, statusEvents = []) {
  const inboundTime = Date.parse(latestInboundAt || '');
  if (!Number.isFinite(inboundTime) || !customerWaId) return false;
  return statusEvents.some((status) => {
    if (status.customer_wa_id !== customerWaId) return false;
    const statusTime = Date.parse(status.occurred_at || '');
    return Number.isFinite(statusTime) && statusTime > inboundTime;
  });
}
