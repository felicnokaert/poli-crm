// Herramientas que hoy son de Felipe: su tablero de Trello, el plan Trello del 16/10 al 31/12 y su rutina
// (Mercado Libre, Shopify, contenido). El resto del equipo no las ve hasta poder conectar las suyas.
const OWNER_EMAILS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com', 'marketing@grupopoliplast.com.ar'];

export function ownsFelipeTools(email, onlineConfigured = true) {
  if (!onlineConfigured) return true; // modo local: es el navegador de quien lo instaló
  return OWNER_EMAILS.includes(String(email || '').trim().toLowerCase());
}

// La Bandeja del equipo se apagó en la beta (16/10): repite lo de "Por revisar", que es personal de cada
// uno. El código queda por si más adelante sirve como central de WhatsApp que derive a los comerciales.
export const TEAM_INBOX_ENABLED = false;
