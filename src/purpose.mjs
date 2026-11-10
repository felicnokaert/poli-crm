// Propósito arriba de la Rutina (10/11, Felipe eligió la opción 1 tras el bootcamp de servicio y atención al cliente).
// El texto de la empresa viene de fábrica y cada persona puede cambiarlo; la línea personal es opcional.
export const DEFAULT_PURPOSE = 'Hacemos que cada obra y cada proyecto de nuestros clientes salga bien.';
export const PURPOSE_KEY = 'poliplast-purpose-company';
export const PERSONAL_PURPOSE_KEY = 'poliplast-purpose-personal';

export function cleanPurpose(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Lo guardado manda; si está vacío o falta, vuelve al texto de fábrica (el personal puede quedar vacío).
export function readPurpose(storage, key = PURPOSE_KEY, fallback = DEFAULT_PURPOSE) {
  try {
    const saved = cleanPurpose(storage?.getItem(key));
    return saved || fallback;
  } catch { return fallback; }
}

export function writePurpose(storage, key, value) {
  try {
    const text = cleanPurpose(value);
    if (text) storage?.setItem(key, text); else storage?.removeItem(key);
    return text;
  } catch { return cleanPurpose(value); }
}
