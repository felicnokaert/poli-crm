// Contraseñas (QA 17/10): mínimo 8 caracteres al crear la cuenta o cambiarla (las que ya existen siguen
// entrando). La protección de contraseñas filtradas de Supabase es del plan pago, así que no se usa.
export const MIN_PASSWORD = 8;

export function passwordProblem(password, confirm) {
  if (String(password || '').length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (confirm !== undefined && password !== confirm) return 'Las contraseñas no coinciden.';
  return '';
}

// Mensajes de Supabase Auth en castellano; lo desconocido pasa tal cual.
export function authErrorEs(error) {
  const text = String(error?.message || '');
  if (text === 'Invalid login credentials') return 'Correo o contraseña incorrectos.';
  if (error?.code === 'same_password' || /should be different/i.test(text)) return 'La contraseña nueva tiene que ser distinta de la actual.';
  if (error?.code === 'weak_password' || /password should (be|contain)/i.test(text)) return `Esa contraseña es muy débil: usá al menos ${MIN_PASSWORD} caracteres, mezclando letras y números.`;
  if (/already registered/i.test(text)) return 'Ese correo ya tiene una cuenta. Ingresá o usá «Olvidé mi contraseña».';
  if (/email not confirmed/i.test(text)) return 'Falta confirmar el correo: revisá tu casilla.';
  return text || 'No se pudo completar. Probá de nuevo.';
}
