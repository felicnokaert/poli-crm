// Metas semanales del Inicio (contactos, efectivos, propuestas). Cada usuario
// puede definir las suyas en Perfil; se guardan en su propio espacio
// (data.weeklyTargets). Sin nada guardado se usan los valores de siempre, así
// que quien no las toca (Felipe) ve exactamente lo mismo y su dato no cambia.
export const DEFAULT_WEEKLY_TARGETS = { contacts: '15', effective: '8–10', proposals: '2–3' };

export const WEEKLY_TARGET_FIELDS = [
  ['contacts', 'Contactos por semana'],
  ['effective', 'Contactos efectivos'],
  ['proposals', 'Propuestas activas'],
];

// Acepta "15", "8-10", "8–10" o "8 a 10". Devuelve el texto normalizado
// ("8–10") o null si no es un número / rango razonable (hasta 3 dígitos, mín <= máx).
export function normalizeTarget(input) {
  const text = String(input ?? '').trim().replace(/\s*(?:–|—|-|a)\s*/i, '-');
  const match = text.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!match) return null;
  const min = Number(match[1]);
  if (match[2] === undefined) return String(min);
  const max = Number(match[2]);
  return min <= max ? `${min}–${max}` : null;
}

// Mezcla lo guardado con los valores por defecto campo por campo; un valor
// guardado inválido se ignora en vez de romper el Inicio.
export function resolveWeeklyTargets(stored) {
  const result = { ...DEFAULT_WEEKLY_TARGETS };
  for (const key of Object.keys(DEFAULT_WEEKLY_TARGETS)) {
    const value = stored && typeof stored === 'object' ? normalizeTarget(stored[key]) : null;
    if (value) result[key] = value;
  }
  return result;
}

// Bienvenida para un espacio recién creado: solo si no tiene nada cargado y
// no la cerró. Un espacio con datos (el de Felipe, Juan) nunca la ve.
export function shouldShowWelcome(data = {}) {
  if (data.welcomeDismissed) return false;
  return ['clients', 'interactions', 'tasks', 'sales'].every((key) => !(data[key] || []).length);
}
