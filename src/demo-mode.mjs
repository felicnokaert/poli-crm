// Poliplast App (prueba, 25/11): modo de prueba con datos inventados. Se prende solo en el link de prueba de la
// rama poliplast-app (sin base conectada) o en la compu con ?demo=1. En la app real nunca se prende.
import { demoWorkspace } from './demo-data.mjs';

export const DEMO_SEEDED_KEY = 'poliplast-app-demo-seeded';
export const DEMO_FLAG_KEY = 'poliplast-app-demo';

export function isDemoMode({ online = false, location = globalThis.location, storage = globalThis.localStorage } = {}) {
  if (online) return false;
  const host = String(location?.hostname || '');
  if (host.includes('-git-poliplast-app-')) return true;
  try {
    if (new URLSearchParams(location?.search || '').has('demo')) { storage?.setItem(DEMO_FLAG_KEY, '1'); return true; }
    return storage?.getItem(DEMO_FLAG_KEY) === '1';
  } catch { return false; }
}

// Devuelve el estado con los datos de prueba la primera vez (o si se pide restablecer).
export function withDemoData(state, { storage = globalThis.localStorage, force = false } = {}) {
  try {
    if (!force && storage?.getItem(DEMO_SEEDED_KEY) === '1') return state;
    storage?.setItem(DEMO_SEEDED_KEY, '1');
  } catch { /* sin almacenamiento: igual carga los datos en memoria */ }
  return { ...state, ...demoWorkspace() };
}

// El link de prueba de Poliplast App (con o sin base conectada). Ahí se muestran los módulos de otras apps
// desde el mismo link (Entregas real, maqueta de la app de conteo) y el cotizador propio.
export function isPreviewSite({ location = globalThis.location, storage = globalThis.localStorage } = {}) {
  const host = String(location?.hostname || '');
  if (host.includes('-git-poliplast-app-')) return true;
  try { return new URLSearchParams(location?.search || '').has('demo') || storage?.getItem(DEMO_FLAG_KEY) === '1'; } catch { return false; }
}
