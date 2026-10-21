import { supabase } from "./online.js";

// Llamadas a /api/admin-users con la sesión al día (21/10): si la pestaña quedó abierta mucho tiempo, el
// pase que tenía la pantalla se vence y el servidor contesta "Sesión no autorizada". Antes de cada llamada
// se pide la sesión vigente (Supabase la renueva sola) y, si igual da 401, se renueva y se reintenta una vez.
async function currentToken(fallback) {
  try {
    const { data } = (await supabase?.auth?.getSession?.()) || {};
    return data?.session?.access_token || fallback || "";
  } catch { return fallback || ""; }
}

export async function adminFetch(body, fallbackToken = "", http = fetch) {
  const send = (token) => http("/api/admin-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let response = await send(await currentToken(fallbackToken));
  if (response.status === 401 && supabase?.auth?.refreshSession) {
    const { data } = await supabase.auth.refreshSession().catch(() => ({ data: null }));
    if (data?.session?.access_token) response = await send(data.session.access_token);
  }
  return response;
}
