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

export function channelsForEmail(email) {
  return USER_CHANNELS[String(email || '').trim().toLowerCase()] || ['general'];
}
