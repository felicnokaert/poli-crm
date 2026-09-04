// Qué canales de WhatsApp le pertenecen a cada cuenta. No es una preferencia
// que el usuario elige libremente: Felipe administra dos números reales
// (General y Penosil) y puede alternar entre ellos; Juan tiene el suyo
// propio y no debería ver ni poder elegir los de nadie más. A medida que se
// sumen más comerciales con su propio número, se agregan acá.
const USER_CHANNELS = {
  'felipe@grupopoliplast.com.ar': ['general', 'penosil'],
  'felipecnokaert@gmail.com': ['general', 'penosil'],
  'juan@grupopoliplast.com.ar': ['juan'],
};

export function channelsForEmail(email) {
  return USER_CHANNELS[String(email || '').trim().toLowerCase()] || ['general'];
}
