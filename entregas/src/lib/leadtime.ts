// Lead time de expedición: desde que el remito se imprime hasta que el pedido sale (despachado).
// Se mide en horas de JORNADA (lun–vie, 8 a 16): si se imprimió el viernes a las 15 y salió el lunes a las 9,
// cuenta 2 h, no 66. Mientras el pedido está impreso y todavía no salió, el reloj corre (cronómetro).
import { horasHabilesEntre } from './fechas'
import type { Pedido } from './types'

/** Hasta acá está bien; después avisa en amarillo; pasada la jornada entera, en rojo. */
export const LEAD_OK_HORAS = 4
export const LEAD_LIMITE_HORAS = 8

export type TonoLead = 'ok' | 'alerta' | 'peligro'

export interface LeadTime {
  horas: number
  /** true = todavía no salió: el reloj sigue corriendo. */
  corriendo: boolean
  tono: TonoLead
}

/** Cuándo salió: el último paso a «despachado» (de la vista) o, si sigue despachado, desde cuándo lo está. */
export function despachoAt(p: Pedido): string | null {
  if (p.despacho_at) return p.despacho_at
  if (p.estado === 'despachado') return p.estado_desde
  return null
}

export function tonoLead(horas: number): TonoLead {
  return horas <= LEAD_OK_HORAS ? 'ok' : horas <= LEAD_LIMITE_HORAS ? 'alerta' : 'peligro'
}

export function leadTime(p: Pedido, ahora: Date = new Date()): LeadTime | null {
  if (!p.impreso_at || p.estado === 'cancelado') return null
  const salio = despachoAt(p)
  if (salio) {
    const horas = horasHabilesEntre(new Date(p.impreso_at), new Date(salio))
    return { horas, corriendo: false, tono: tonoLead(horas) }
  }
  if (p.estado !== 'impreso') return null
  const horas = horasHabilesEntre(new Date(p.impreso_at), ahora)
  return { horas, corriendo: true, tono: tonoLead(horas) }
}

/** 45 min · 2 h 10 min · 12 h */
export function duracion(horas: number): string {
  const min = Math.round(horas * 60)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m && h < 10 ? `${h} h ${m} min` : `${h} h`
}

/** Promedio y mediana de los que ya salieron (para la pantalla de Inicio y el cierre del día). */
export function resumenLead(pedidos: Pedido[]): { cantidad: number; promedio: number | null; mediana: number | null } {
  const horas = pedidos.map((p) => leadTime(p)).filter((l): l is LeadTime => !!l && !l.corriendo).map((l) => l.horas).sort((a, b) => a - b)
  if (!horas.length) return { cantidad: 0, promedio: null, mediana: null }
  const promedio = horas.reduce((a, b) => a + b, 0) / horas.length
  const mitad = Math.floor(horas.length / 2)
  const mediana = horas.length % 2 ? horas[mitad] : (horas[mitad - 1] + horas[mitad]) / 2
  return { cantidad: horas.length, promedio, mediana }
}
