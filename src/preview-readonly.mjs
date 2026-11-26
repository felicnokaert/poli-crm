// Poliplast App (26/11, Felipe: «en el link de prueba cargame todo lo real, pero si hago modificaciones no afecta a
// nada»). En el link de prueba con la base conectada, todo se LEE de verdad (también en tiempo real), pero ninguna
// escritura sale: se responde «como si» se hubiera guardado, solo en esta pantalla. Se instala antes que el cliente
// de Supabase (es el primer import de main.jsx), así todas las llamadas pasan por acá.
import { isPreviewSite } from './demo-mode.mjs';

const READ_OPS = new Set(['status', 'list', 'activity', 'probe', 'scopes', 'sent-ids']);

// ¿Esta llamada escribe? (PostgREST: todo lo que no es GET/HEAD, salvo las funciones rpc que solo leen;
// Storage: subir o borrar; servidor de la app: las acciones que no son de lectura.)
export function isWrite(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const text = String(url);
  if (/\/auth\/v1\//.test(text)) return false; // iniciar o renovar la sesión
  if (/\/rest\/v1\/rpc\//.test(text)) return false; // funciones de lectura (listados, nombres)
  if (/\/rest\/v1\//.test(text) || /\/storage\/v1\//.test(text)) return true;
  if (/\/api\/admin-users/.test(text)) {
    try {
      const body = JSON.parse(init.body || '{}');
      if (body.action === 'assistant') return false;
      return !READ_OPS.has(String(body.op || ''));
    } catch { return true; }
  }
  if (/\/api\/meta-subscribe|\/api\/prospeccion|\/api\/tasks/.test(text)) return true;
  return false;
}

// Respuesta falsa «guardado»: devuelve lo que se mandó (PostgREST lo devolvería con return=representation).
export function fakeWrite(url, init = {}) {
  let body = null;
  try { body = init.body ? JSON.parse(init.body) : null; } catch { body = null; }
  const headers = new Headers(init.headers || {});
  const single = /vnd\.pgrst\.object/.test(headers.get('Accept') || '');
  if (/\/api\//.test(String(url))) body = { ok: false, readOnly: true, error: 'Modo prueba: en este link no se guarda nada.' };
  else if (single && Array.isArray(body)) body = body[0] || {};
  else if (body && !Array.isArray(body) && !single) body = [body];
  return new Response(JSON.stringify(body ?? []), { status: /\/api\//.test(String(url)) ? 200 : 201, headers: { 'Content-Type': 'application/json' } });
}

export const READONLY_KEY = 'poliplast-app-solo-lectura';
export function readOnlyActive() {
  try { return localStorage.getItem(READONLY_KEY) !== '0'; } catch { return true; }
}

export function installPreviewReadOnly(win = globalThis.window) {
  if (!win || win.__poliplastReadOnly || !isPreviewSite() || !import.meta.env?.VITE_SUPABASE_URL) return false;
  if (!readOnlyActive()) return false;
  const realFetch = win.fetch.bind(win);
  win.__poliplastReadOnly = { blocked: 0 };
  win.fetch = (url, init = {}) => {
    const target = typeof url === 'string' ? url : url?.url || String(url);
    if (isWrite(target, init)) {
      win.__poliplastReadOnly.blocked += 1;
      win.dispatchEvent(new CustomEvent('poliplast:solo-lectura', { detail: { url: target } }));
      return Promise.resolve(fakeWrite(target, init));
    }
    return realFetch(url, init);
  };
  return true;
}

installPreviewReadOnly();
