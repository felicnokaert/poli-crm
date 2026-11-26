// Cuando se abre la cámara del celular, Android a veces saca a la página de la memoria y al volver la recarga: se pierde la foto y
// el pedido abierto, sin ningún error («no la toma», Felipe 26/11). Antes de abrir la cámara se anota qué pedido era; si al volver
// la página arrancó de cero, se reabre ese pedido y se avisa qué pasó.
const CLAVE = 'entregas-camara-pendiente'
const VIGENCIA_MS = 10 * 60 * 1000

export interface CamaraPendiente { codigo: number; tipo: string; at: number }

export function marcarCamara(codigo: number, tipo: string): void {
  try { sessionStorage.setItem(CLAVE, JSON.stringify({ codigo, tipo, at: Date.now() })) } catch { /* sin storage */ }
}

export function limpiarCamara(): void {
  try { sessionStorage.removeItem(CLAVE) } catch { /* sin storage */ }
}

/** La marca, si es reciente (si no, se borra). */
export function camaraPendiente(ahora = Date.now()): CamaraPendiente | null {
  try {
    const raw = sessionStorage.getItem(CLAVE)
    if (!raw) return null
    const dato = JSON.parse(raw) as CamaraPendiente
    if (!dato?.codigo || ahora - Number(dato.at) > VIGENCIA_MS) { limpiarCamara(); return null }
    return dato
  } catch {
    return null
  }
}
