// Manda al servidor el detalle de un error de pantalla (lib/error-log.mjs), para que Felipe lo vea en
// Datos sin depender de que alguien lo cuente. Como mucho 5 por sesión, y nunca rompe nada si falla.
import { onlineConfigured, supabase } from './online.js';

let sent = 0;
export async function reportClientError(error, { view = '' } = {}) {
  if (!onlineConfigured || sent >= 5) return;
  sent += 1;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'logError', view, message: String(error?.message || error || ''), stack: String(error?.stack || ''), url: globalThis.location?.href || '', userAgent: globalThis.navigator?.userAgent || '' }),
    });
  } catch {
    // sin conexión o sin sesión: no se registra, la app sigue igual
  }
}
