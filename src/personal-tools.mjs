// Herramientas que hoy son de Felipe: su tablero de Trello, el plan Trello del 16/10 al 31/12 y su rutina
// (Mercado Libre, Shopify, contenido). El resto del equipo no las ve hasta poder conectar las suyas.
const OWNER_EMAILS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com', 'marketing@grupopoliplast.com.ar'];

export function ownsFelipeTools(email, onlineConfigured = true) {
  if (!onlineConfigured) {
    // Modo local: es el navegador de quien lo instaló. Para probar cómo lo ve el resto del equipo
    // sin tener sus cuentas: localStorage.setItem('poliplast-simulate-member', '1').
    try { return globalThis.localStorage?.getItem('poliplast-simulate-member') !== '1'; } catch { return true; }
  }
  return OWNER_EMAILS.includes(String(email || '').trim().toLowerCase());
}

// La Bandeja del equipo se apagó en la beta (16/10): repite lo de "Por revisar", que es personal de cada
// uno. El código queda por si más adelante sirve como central de WhatsApp que derive a los comerciales.
export const TEAM_INBOX_ENABLED = false;

// Mapa de aplicadores (RAPYP): lo ven solo Felipe, Juan y David (pedido de Felipe, 16/10). El resto
// del equipo ve los mapas de ventas y de prospectos.
const RAPYP_MAP_EMAILS = [...OWNER_EMAILS, 'juan@grupopoliplast.com.ar', 'david@grupopoliplast.com.ar'];

export function canSeeRapypMap(email, onlineConfigured = true) {
  if (!onlineConfigured) return ownsFelipeTools(email, false);
  return RAPYP_MAP_EMAILS.includes(String(email || '').trim().toLowerCase());
}
