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
    return new URLSearchParams(win.location.search).get('embed') === 'app' // PARCHE CONTEO: también en una pestaña aparte (pantalla grande del monitor)
  } catch {
    return false
  }
}

/** En la maqueta (datos de mentira, solo en la compu) cualquier página de localhost hace de CRM para probar. */
const MAQUETA_LOCAL = import.meta.env.MODE === 'maqueta'

/**
 * Entregas como pantalla de Poliplast App (26/11, ?embed=app&marco=poliplast, iframe del MISMO origen): sin barra ni menú propios,
 * del ancho del contenedor y con el mismo contrato que dentro del CRM (alto, vista y tema). El login es la sesión de Supabase que ya
 * está guardada en ese origen (la misma app), así que no se pide de nuevo.
 */
export function enMarcoPoliplast(win: Window = window): boolean {
  try {
    return new URLSearchParams(win.location.search).get('marco') === 'poliplast' && win.parent !== win
  } catch {
    return false
  }
}

export function isCrmOrigin(origin: string): boolean {
  if (CRM_ORIGINS.includes(origin) || (MAQUETA_LOCAL && /^http:\/\/localhost:\d+$/.test(origin))) return true
  // En Poliplast App el «CRM» es el padre del mismo origen.
  return typeof window !== 'undefined' && enMarcoPoliplast() && origin === window.location.origin
}

/** A dónde se le habla al CRM (en la maqueta, a cualquier localhost). */
export function origenesCrm(): string[] {
  if (MAQUETA_LOCAL) return ['*']
  return typeof window !== 'undefined' && enMarcoPoliplast() ? [...CRM_ORIGINS, window.location.origin] : CRM_ORIGINS
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

/** La sesión que mandó el CRM no sirve (venció o se cerró en otro equipo): el CRM la renueva y la reenvía, o pide ingresar. */
export function avisarSinSesionAlCrm(): void {
  for (const origin of origenesCrm()) {
    try { window.parent.postMessage({ tipo: 'app:sin-sesion' }, origin) } catch { /* otro origen */ }
  }
}

/** Ya se ve la pantalla de Entregas: el CRM saca su animación de carga. */
export function avisarVisibleAlCrm(): void {
  if (!isEmbeddedInCrm()) return
  for (const origin of origenesCrm()) {
    try { window.parent.postMessage({ tipo: 'entregas:visible' }, origin) } catch { /* otro origen */ }
  }
}
