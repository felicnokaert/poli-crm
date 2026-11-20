// Lee el texto de un remito de Contabilium (el PDF que genera el sistema) y saca los datos de envío.
// Formato de referencia: el mismo que lee el CRM (poliplast-sales-copilot/src/invoice-parser.mjs):
//   Remito
//   Nº: 0013-00005802
//   Fecha: 03/09/2026
//   Razón social: ESTEBAN JOSE SARTORI
//   Domicilio: PERITO MORENO 446 - CP 6450. Tel: 1132148987
//   Ubicación: PEHUAJO, Buenos Aires CUIT: 20244088245
//   2 PMRAC-V-521 PMRAC-V 521
//   Cantidad total: 3
//   VPS: $ 60.272,71. Transporte: VIA CARGO
import type { ItemRemito } from './types'

export interface RemitoLeido {
  esRemito: boolean
  tipoDetectado: string
  n_remito: string
  fecha_remito: string | null
  cliente: string
  cuit: string | null
  direccion: string | null
  cp: string | null
  telefono: string | null
  localidad: string | null
  provincia: string | null
  transporte: string | null
  items: ItemRemito[]
  /** Cuántos de los datos principales se pudieron leer (para avisar si el PDF no es de Contabilium). */
  camposLeidos: number
}

const TIPOS: [string, RegExp][] = [
  ['Remito', /\bRemito\b/i],
  ['Factura', /\bFactura\b/i],
  ['Cotización', /\bCotizaci[oó]n\b|\bPresupuesto\b/i],
  ['Nota de crédito', /Nota de Cr[ée]dito/i],
]

function limpiar(valor: string | undefined | null): string | null {
  const v = (valor ?? '').replace(/\s+/g, ' ').trim().replace(/[.,;-]+$/, '').trim()
  return v ? v : null
}

function isoDesdeFechaAR(valor: string): string | null {
  const m = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function soloDigitos(valor: string | null): string | null {
  const d = (valor ?? '').replace(/\D/g, '')
  return d || null
}

// Renglón de ítem de remito: "<cantidad> <código> <descripción>" sin precios.
const ITEM = /^\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+?)\s*$/

export function parseRemito(texto: string): RemitoLeido {
  const t = String(texto ?? '').replace(/\r/g, '')
  const lineas = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const tipo = TIPOS.find(([, re]) => re.test(t))?.[0] ?? ''

  const numero = t.match(/N[°ºo]?\s*:?\s*(\d{4})\s*-\s*(\d{4,8})/i)
  const fecha = t.match(/Fecha(?: de emisi[oó]n)?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)
  const cliente = t.match(/(?:Raz[oó]n social|Señor(?:es)?|Cliente)\s*:\s*([^\n]+)/i)

  // Domicilio: "CALLE 123 - CP 1884. Tel: 1132148987"
  const domLinea = t.match(/Domicilio\s*:\s*([^\n]*)/i)?.[1] ?? ''
  let direccion: string | null = null
  let cp: string | null = null
  let telefono: string | null = null
  if (domLinea) {
    const tel = domLinea.match(/Tel(?:[ée]fono)?\.?\s*:?\s*([\d\s()+/-]*)/i)
    telefono = tel ? limpiar(tel[1]) : null
    const sinTel = tel ? domLinea.slice(0, tel.index) : domLinea
    const cpMatch = sinTel.match(/-?\s*C\.?P\.?\s*:?\s*([A-Z]?\d{4}[A-Z]{0,3})/i)
    cp = cpMatch ? cpMatch[1].toUpperCase() : null
    direccion = limpiar(cpMatch ? sinTel.slice(0, cpMatch.index) : sinTel)
  }
  if (!telefono) {
    const tel = t.match(/Tel(?:[ée]fono)?\.?\s*:\s*([\d\s()+/-]{6,})/i)
    telefono = tel ? limpiar(tel[1]) : null
  }

  // Ubicación: "PEHUAJO, Buenos Aires CUIT: 20244088245"
  const ubiLinea = t.match(/Ubicaci[oó]n\s*:\s*([^\n]*)/i)?.[1] ?? ''
  const ubiSinCuit = ubiLinea.split(/CUIT|DNI|Condici[oó]n/i)[0]
  const [loc, ...prov] = ubiSinCuit.split(',')
  const localidad = limpiar(loc)
  const provincia = limpiar(prov.join(','))

  const cuitMatch = t.match(/(?:CUIT|DNI|CUIL)\s*:?\s*([\d-]{7,13})/i)
  // El primer CUIT del documento puede ser el de Poliplast (encabezado); preferimos el que está en la línea de Ubicación.
  const cuitUbi = ubiLinea.match(/(?:CUIT|DNI|CUIL)\s*:?\s*([\d-]{7,13})/i)
  const cuit = soloDigitos(cuitUbi?.[1] ?? cuitMatch?.[1] ?? null)

  const transporte = limpiar(t.match(/Transporte\s*:\s*([^\n]*)/i)?.[1] ?? null)

  // Ítems: entre la línea de condición/ubicación y "Cantidad total".
  const items: ItemRemito[] = []
  const fin = lineas.findIndex((l) => /^Cantidad total/i.test(l))
  const inicio = (() => {
    const idx = lineas.findIndex((l) => /^Condici[oó]n de venta|^Ubicaci[oó]n/i.test(l))
    return idx >= 0 ? idx + 1 : 0
  })()
  const tramo = lineas.slice(inicio, fin >= 0 ? fin : lineas.length)
  for (const l of tramo) {
    if (/^(Condici[oó]n|Ubicaci[oó]n|Domicilio|Raz[oó]n|Fecha|N[°º]|Cantidad|C[oó]digo|Descripci[oó]n)/i.test(l)) continue
    const m = l.match(ITEM)
    if (!m) continue
    const cantidad = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) continue
    if (/impuesto\s+interno/i.test(m[3])) continue
    items.push({ cantidad, codigo: m[2], descripcion: m[3].trim() })
  }

  const n_remito = numero ? `${numero[1]}-${numero[2].padStart(8, '0')}` : ''
  const leidos = [n_remito, cliente?.[1], direccion, localidad].filter(Boolean).length

  return {
    esRemito: tipo === 'Remito',
    tipoDetectado: tipo,
    n_remito,
    fecha_remito: fecha ? isoDesdeFechaAR(fecha[1]) : null,
    cliente: limpiar(cliente?.[1]) ?? '',
    cuit,
    direccion,
    cp,
    telefono,
    localidad,
    provincia,
    transporte,
    items,
    camposLeidos: leidos,
  }
}

/** ¿El PDF es una guía / constancia de envío del expreso (Credifin, Via Cargo, OCA…) y no un remito nuestro?
 * Pasó con Mainero (20/11): se cargó la guía de Credifin en «Cargar remito» y se leyó como si fuera un remito. */
export function pareceGuiaDeExpreso(texto: string): boolean {
  const t = String(texto ?? '')
  if (/gu[ií]a\s+de\s+transporte|constancia\s+de\s+env[ií]o|remito\s+del\s+cliente|remito\/s\s*n(?:ro|°|º)/i.test(t)) return true
  // Guía genérica: trae «Remitente» y «Destinatario» y un N° de guía, cosas que el remito de Contabilium no trae juntas.
  return /\bremitente\b/i.test(t) && /\bdestinatario\b/i.test(t) && /\bgu[ií]a\s*(?:n[°ºo]?\.?)?\s*[:#]/i.test(t)
}

/** Normaliza lo que escribe la gente ("13-5802", "0013 00005802") al formato 0013-00005802. */
export function normalizarNumeroRemito(valor: string): string {
  const m = valor.trim().match(/^(\d{1,4})\s*[-/ ]\s*(\d{1,8})$/)
  if (!m) return valor.trim().toUpperCase()
  return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`
}

/** Intenta reconocer el expreso a partir del texto "Transporte:" del remito. */
export function adivinarExpreso<T extends { id: string; nombre: string }>(transporte: string | null, expresos: T[]): T | null {
  if (!transporte) return null
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const t = norm(transporte)
  if (!t) return null
  const directo = expresos.find((e) => {
    const n = norm(e.nombre)
    return n && (t.includes(n) || n.includes(t))
  })
  if (directo) return directo
  // «RETIRA EN DEPÓSITO», «Retiro en planta», «lo busca el cliente»: va al expreso «Retira el cliente».
  if (/retir|deposito|planta|mostrador|busca/.test(t)) return expresos.find((e) => /retir/.test(norm(e.nombre))) ?? null
  return null
}
