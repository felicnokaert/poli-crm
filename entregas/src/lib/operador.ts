// Cuenta compartida de expedición: el dispositivo recuerda qué persona lo está usando (y desde qué depósito)
// (Marcos, Neyen, …). Ese nombre viaja en cada pedido a la base (header x-operador) y queda
// registrado en el historial. La base solo lo acepta para cuentas marcadas como compartidas.

const CLAVE = 'poli-entregas-operador'
const oyentes = new Set<() => void>()

function leer(): string | null {
  try { return localStorage.getItem(CLAVE) || null } catch { return null }
}

let actual: string | null = leer()

export function operadorActual(): string | null {
  return actual
}

export function setOperador(nombre: string | null): void {
  actual = nombre?.trim() || null
  try {
    if (actual) localStorage.setItem(CLAVE, actual)
    else localStorage.removeItem(CLAVE)
  } catch { /* sin storage: dura hasta recargar */ }
  oyentes.forEach((cb) => cb())
}

export function alCambiarOperador(cb: () => void): () => void {
  oyentes.add(cb)
  return () => oyentes.delete(cb)
}

/** Valor de un header: base64 de UTF-8 (los headers HTTP no admiten tildes). */
function base64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

export function headerOperador(): string | null {
  return actual ? base64(actual) : null
}

// Depósito desde donde trabaja este dispositivo (Villa Domínico, Mar del Plata). Viaja en el header x-deposito
// y queda en cada paso del historial. La base lo acepta solo para expedición y administradores.
const CLAVE_DEPOSITO = 'poli-entregas-deposito'
let deposito: string | null = (() => { try { return localStorage.getItem(CLAVE_DEPOSITO) || null } catch { return null } })()

export function depositoActual(): string | null {
  return deposito
}

export function setDeposito(nombre: string | null): void {
  deposito = nombre?.trim() || null
  try {
    if (deposito) localStorage.setItem(CLAVE_DEPOSITO, deposito)
    else localStorage.removeItem(CLAVE_DEPOSITO)
  } catch { /* sin storage: dura hasta recargar */ }
  oyentes.forEach((cb) => cb())
}

/** Depósito de cada persona si no se elige a mano: Braian trabaja en Mar del Plata; el resto en Villa Domínico. */
const DEPOSITO_DE: Record<string, string> = { braian: 'Mar del Plata' }
const DEPOSITO_COMUN = 'Villa Domínico'

export function depositoDePersona(nombre: string, depositos: string[]): string | null {
  const d = DEPOSITO_DE[nombre.trim().toLowerCase()] ?? DEPOSITO_COMUN
  return depositos.includes(d) ? d : depositos[0] ?? null
}

/** «Depósito Villa Domínico» → «Villa Domínico» (la app de conteo a veces lo manda con la palabra adelante). */
export function limpiarDeposito(nombre: string): string {
  return nombre.trim().replace(/^dep[oó]sito\s+/i, '')
}

/** La app de conteo manda quién es y en qué depósito (?persona=…&deposito=…): se toma sin volver a preguntar. */
export function tomarPersonaDeLaUrl(search: string = window.location.search): void {
  const q = new URLSearchParams(search)
  const persona = q.get('persona')?.trim()
  const dep = q.get('deposito')?.trim()
  if (dep) setDeposito(limpiarDeposito(dep))
  if (persona) setOperador(persona)
}

export function headerDeposito(): string | null {
  return deposito ? base64(deposito) : null
}
