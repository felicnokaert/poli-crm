// Entregas como pestaña del CRM (poli-crm, ?embed=1 dentro de un iframe). Mismo esquema que el cotizador:
// dentro del CRM no se guarda ni se renueva la sesión acá; la manda el CRM (y la reenvía cada vez que la
// renueva). Si los dos renovaran el mismo token, uno invalidaría al otro y el CRM se desloguearía.
// Por fuera del CRM (link directo) la app funciona igual que siempre, con su propio login.
export const CRM_ORIGINS = ['https://poli-crm.vercel.app', 'http://localhost:5173']

export function isEmbeddedInCrm(win: Window = window): boolean {
  try {
    return new URLSearchParams(win.location.search).get('embed') === '1' && win.parent !== win
  } catch {
    return false
  }
}

/**
 * Entregas como sección de otra app del grupo (la app de conteo, ?embed=app dentro de un iframe): se ve sin
 * marco, como una pantalla más, pero el login es el de siempre y queda guardado en ese equipo (la otra app no
 * tiene usuarios de Supabase). No recibe ni manda sesiones.
 */
export function isEmbeddedInApp(win: Window = window): boolean {
  try {
    return new URLSearchParams(win.location.search).get('embed') === 'app' && win.parent !== win
  } catch {
    return false
  }
}

/** En la maqueta (datos de mentira, solo en la compu) cualquier página de localhost hace de CRM para probar. */
const MAQUETA_LOCAL = import.meta.env.MODE === 'maqueta'

export function isCrmOrigin(origin: string): boolean {
  return CRM_ORIGINS.includes(origin) || (MAQUETA_LOCAL && /^http:\/\/localhost:\d+$/.test(origin))
}

/** A dónde se le habla al CRM (en la maqueta, a cualquier localhost). */
export function origenesCrm(): string[] {
  return MAQUETA_LOCAL ? ['*'] : CRM_ORIGINS
}

/** Escucha la sesión que manda el CRM y avisa que la pestaña está lista. Devuelve la función para dejar de escuchar. */
export function escucharSesionDelCrm(onSesion: (accessToken: string, refreshToken: string) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isCrmOrigin(event.origin) || event.source !== window.parent) return
    const data = event.data as { tipo?: string; access_token?: string; refresh_token?: string }
    if (data?.tipo !== 'crm:sesion' || !data.access_token || !data.refresh_token) return
    onSesion(data.access_token, data.refresh_token)
  }
  window.addEventListener('message', onMessage)
  for (const origin of origenesCrm()) {
    try { window.parent.postMessage({ tipo: 'entregas:listo' }, origin) } catch { /* otro origen */ }
  }
  return () => window.removeEventListener('message', onMessage)
}
