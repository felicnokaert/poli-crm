// Firma de los mails de Prospección (3/11, Felipe: "que vaya con mi firma, «Feli» o la que yo indique"). Cada persona define la suya
// (texto simple; los mails salen en texto plano, así que no lleva logo ni formato). Se guarda en este navegador, por cuenta.
const key = (email) => `poliplast-mail-firma:${String(email || '').toLowerCase()}`;
export const defaultSignature = (email) => String(email || '').split('@')[0].split(/[._-]/)[0].replace(/^./, (c) => c.toLocaleUpperCase('es-AR'));
export function loadSignature(email) {
  try { return String(localStorage.getItem(key(email)) || '').trim(); } catch { return ''; }
}
export function saveSignature(email, text) {
  try { const clean = String(text || '').trim().slice(0, 400); if (clean) localStorage.setItem(key(email), clean); else localStorage.removeItem(key(email)); } catch { /* sin almacenamiento: queda la firma por defecto */ }
}
export const signatureFor = (email) => loadSignature(email) || defaultSignature(email);
