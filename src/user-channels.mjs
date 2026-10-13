// Qué canales de WhatsApp le pertenecen a cada cuenta. No es una preferencia
// que el usuario elige libremente: Felipe administra dos números reales
// (General y Penosil) y puede alternar entre ellos; Juan tiene el suyo
// propio y no debería ver ni poder elegir los de nadie más. A medida que se
// sumen más comerciales con su propio número, se agregan acá.
const USER_CHANNELS = {
  // Penosil se sacó de la cuenta de Felipe a propósito (04/09/2026): va a
  // vivir en su propia cuenta (info@grupopoliplast.com.ar) para no mezclar
  // info con General. Los datos de whatsapp_events no se tocan, solo se deja
  // de mostrar acá.
  'felipe@grupopoliplast.com.ar': ['general'],
  'felipecnokaert@gmail.com': ['general'],
  'juan@grupopoliplast.com.ar': ['juan'],
  'info@grupopoliplast.com.ar': ['penosil'],
};

// Quien no está en la lista (cuentas nuevas, pruebas) no tiene ningún canal:
// usa el CRM con su propio espacio, pero no ve chats de WhatsApp de nadie.
// Debe coincidir con public.user_allowed_channels() en la base.
export function channelsForEmail(email) {
  return USER_CHANNELS[String(email || '').trim().toLowerCase()] || [];
}

// Canales finales de una persona: los de la tabla whatsapp_channels (donde
// figura como miembro) sumados a los del mapa fijo de arriba. El mapa fijo es
// una red de seguridad: si la tabla no responde (o aun no existe), las cuentas
// historicas siguen viendo lo mismo que siempre. Los datos en si los decide la
// base (RLS de whatsapp_events), asi que esto solo gobierna que muestra la UI.
export function resolveChannels(email, rows = []) {
  const fromTable = (Array.isArray(rows) ? rows : []).map((row) => row?.channel_key).filter(Boolean);
  return [...new Set([...channelsForEmail(email), ...fromTable])];
}

// Quien puede administrar canales en pantalla. La autoridad real es la policy
// de la base (is_poliplast_channel_admin); esto solo decide si se muestra el panel.
const CHANNEL_ADMINS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com'];
export function isChannelAdmin(email) {
  return CHANNEL_ADMINS.includes(String(email || '').trim().toLowerCase());
}
