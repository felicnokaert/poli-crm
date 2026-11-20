// A qué pedido corresponde una guía del expreso, leyendo su texto. Orden: 0) N° de remito (muchas guías lo traen,
// p. ej. Credifin «Remito/s Nro»; es exacto) y después lo que pidió Felipe (20/11): 1) CUIT (o DNI) del cliente,
// 2) teléfono, 3) razón social, 4) dirección. Se usa el primer criterio que encuentre
// algo; si varios pedidos coinciden (mismo cliente con dos pedidos), se proponen todos y la persona elige.
// Siempre es una sugerencia: nada se guarda sin que alguien lo confirme.
import type { Pedido } from './types'

export type Criterio = 'remito' | 'cuit' | 'telefono' | 'razon' | 'direccion'

export const CRITERIO_LABEL: Record<Criterio, string> = {
  remito: 'por N° de remito',
  cuit: 'por CUIT / DNI',
  telefono: 'por teléfono',
  razon: 'por razón social',
  direccion: 'por dirección',
}

export interface Emparejamiento {
  por: Criterio
  /** Pedidos que coinciden, el más probable primero. */
  pedidos: Pedido[]
}

const SIN_VALOR = new Set(['sa', 'srl', 'sas', 'saic', 'sacif', 'saci', 'sh', 'scs', 'sca', 'ltda', 'cia', 'de', 'del', 'la', 'las',
  'los', 'el', 'y', 'e', 'en', 'for', 'the', 'and'])
const DE_CALLE = new Set(['av', 'avda', 'avenida', 'calle', 'pje', 'pasaje', 'ruta', 'km', 'n', 'nro', 'numero', 'piso', 'dto',
  'depto', 'departamento', 'local', 'esq', 'esquina', 'bis', 'entre', 'y', 'de', 'del', 'la', 'las', 'los', 'el', 'sn', 'pb'])

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function palabras(s: string): string[] {
  return normalizar(s).split(' ').filter(Boolean)
}

/** CUIT/CUIL que aparecen en el texto (11 dígitos, con o sin guiones). */
export function cuitsDelTexto(texto: string): Set<string> {
  const out = new Set<string>()
  for (const m of texto.matchAll(/(?<!\d)(\d{2})[\s.-]?(\d{8})[\s.-]?(\d)(?!\d)/g)) out.add(m[1] + m[2] + m[3])
  return out
}

/** DNI que aparecen sueltos (7 u 8 dígitos, con o sin puntos) o dentro de un CUIT, sin ceros adelante. */
function dnisDelTexto(texto: string, cuits: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const c of cuits) out.add(String(Number(c.slice(2, 10))))
  for (const m of texto.matchAll(/(?<![\d.])(\d{1,2})\.?(\d{3})\.?(\d{3})(?![\d.])/g)) out.add(String(Number(m[1] + m[2] + m[3])))
  return out
}

function remitoNormal(n: string): string | null {
  const m = n.match(/(\d{1,5})\D+(\d{1,8})/)
  return m ? `${m[1].padStart(4, '0').slice(-4)}-${m[2].padStart(8, '0')}` : null
}

/** Números de remito del texto (0006-00006361), normalizados. */
function remitosDelTexto(texto: string): Set<string> {
  const out = new Set<string>()
  for (const m of texto.matchAll(/(?<![\d-])(\d{1,5}\s*-\s*\d{1,8})(?![\d-])/g)) { const n = remitoNormal(m[1]); if (n) out.add(n) }
  return out
}

/** Números del texto armados con grupos de dígitos seguidos (separados solo por espacios, guiones, puntos o
 * paréntesis), de 1 a 5 grupos: así «(0387) 15-444-2211» da también «4442211», «154442211», etc. */
function tirasDeDigitos(texto: string): string[] {
  const out: string[] = []
  for (const bloque of texto.match(/\d[\d\s\-().\/]*\d|\d/g) ?? []) {
    const grupos = bloque.match(/\d+/g) ?? []
    for (let i = 0; i < grupos.length; i += 1) {
      let acc = ''
      for (let j = i; j < Math.min(grupos.length, i + 5); j += 1) { acc += grupos[j]; out.push(acc) }
    }
  }
  return out
}

/** Últimos 7 dígitos del teléfono: lo que no cambia si se escribe con 0, 15 o sin la característica. */
function claveTelefono(tel: string | null): string | null {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-7) : null
}

/** Palabras que identifican la razón social (sin S.A., SRL, «de», etc.). */
function clavesRazon(cliente: string): string[] {
  return palabras(cliente).filter((w) => w.length >= 3 && !SIN_VALOR.has(w))
}

function coincideRazon(cliente: string, renglones: Set<string>[]): boolean {
  const claves = clavesRazon(cliente)
  if (!claves.length || claves.join('').length < 5) return false
  return renglones.some((r) => claves.every((w) => r.has(w)))
}

function coincideDireccion(direccion: string | null, renglones: Set<string>[]): boolean {
  const ws = palabras(direccion ?? '').filter((w) => !DE_CALLE.has(w))
  const numero = ws.find((w) => /^\d{2,5}$/.test(w))
  const nombre = ws.filter((w) => /^[a-z]{4,}$/.test(w))
  if (!numero || !nombre.length) return false
  return renglones.some((r) => r.has(numero) && nombre.every((w) => r.has(w)))
}

const SALIO = new Set(['despachado', 'entregado', 'incidencia'])

/** Pedidos a los que todavía les puede faltar la guía (no cancelados y sin guía cargada). */
export function candidatosGuia(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter((p) => p.estado !== 'cancelado' && !p.n_guia && !p.tiene_guia_archivo)
}

/** Primero los que ya salieron (son los que esperan la guía), después el más reciente. */
function porProbabilidad(a: Pedido, b: Pedido): number {
  const sa = SALIO.has(a.estado) ? 0 : 1
  const sb = SALIO.has(b.estado) ? 0 : 1
  if (sa !== sb) return sa - sb
  return (b.fecha_despacho ?? b.created_at).localeCompare(a.fecha_despacho ?? a.created_at)
}

export function emparejarGuia(texto: string, pedidos: Pedido[]): Emparejamiento | null {
  if (!texto.trim() || !pedidos.length) return null
  const cuits = cuitsDelTexto(texto)
  const dnis = dnisDelTexto(texto, cuits)
  const remitos = remitosDelTexto(texto)
  const tiras = tirasDeDigitos(texto)
  // El nombre y la dirección se buscan dentro de un mismo renglón (si no, «OTRO CLIENTE» coincidía con palabras sueltas).
  const renglones = texto.split(/\n/).map((l) => new Set(palabras(l)))

  const pruebas: [Criterio, (p: Pedido) => boolean][] = [
    ['remito', (p) => { const n = remitoNormal(p.n_remito); return !!n && remitos.has(n) }],
    ['cuit', (p) => {
      const c = (p.cuit ?? '').replace(/\D/g, '')
      if (c.length === 11) return cuits.has(c)
      // A veces en el pedido está el DNI: se busca suelto o dentro del CUIT de la guía.
      return c.length >= 7 && c.length <= 8 && dnis.has(String(Number(c)))
    }],
    ['telefono', (p) => { const k = claveTelefono(p.telefono); return !!k && tiras.some((t) => t.endsWith(k)) }],
    ['razon', (p) => coincideRazon(p.cliente, renglones)],
    ['direccion', (p) => coincideDireccion(p.direccion, renglones)],
  ]
  for (const [por, coincide] of pruebas) {
    const hallados = pedidos.filter(coincide)
    if (hallados.length) return { por, pedidos: [...hallados].sort(porProbabilidad) }
  }
  return null
}
