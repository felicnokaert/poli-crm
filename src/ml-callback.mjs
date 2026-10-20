// Vuelta de Mercado Libre después de autorizar: https://poli-crm.vercel.app/?code=TG-...&state=ml-...
export function mlCallbackParams(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  const code = params.get('code') || '';
  const state = params.get('state') || '';
  return code && state.startsWith('ml-') ? { code, state } : null;
}
