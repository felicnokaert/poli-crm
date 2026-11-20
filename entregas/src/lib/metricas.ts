// Contadores e indicadores de la pantalla de Inicio.
import { alertaDe, faltantesDe } from './estados'
import { desdeISO, diasHabilesEntre, hoyISO } from './fechas'
import { rangoDe } from './filtros'
import type { Config, Expreso, Pedido } from './types'

export interface Contadores {
  sinImprimir: number
  sinImprimirAtrasados: number
  enPreparacion: number
  sinStock: number
  frenadosOtros: number
  enTransito: number
  atrasadosExpreso: number
  incidencias: number
  sinGuia: number
  sinComprobante: number
  despachadosHoy: number
  entregadosMes: number
  cargadosMes: number
  requierenAtencion: number
}

export function contar(pedidos: Pedido[], expresos: Map<string, Expreso>, config: Config, ahora: Date = new Date()): Contadores {
  const hoy = hoyISO(ahora)
  const mes = rangoDe('mes', ahora)!
  const c: Contadores = {
    sinImprimir: 0, sinImprimirAtrasados: 0, enPreparacion: 0, sinStock: 0, frenadosOtros: 0, enTransito: 0,
    atrasadosExpreso: 0, incidencias: 0, sinGuia: 0, sinComprobante: 0, despachadosHoy: 0, entregadosMes: 0,
    cargadosMes: 0, requierenAtencion: 0,
  }
  for (const p of pedidos) {
    const e = p.expreso_id ? expresos.get(p.expreso_id) : undefined
    const alerta = alertaDe(p, e, config, ahora)
    if (alerta) c.requierenAtencion += 1
    if (p.estado === 'cargado') {
      c.sinImprimir += 1
      if (alerta) c.sinImprimirAtrasados += 1
    }
    if (p.estado === 'impreso') c.enPreparacion += 1
    if (p.estado === 'bloqueado') {
      if (p.bloqueo_motivo === 'sin_stock') c.sinStock += 1
      else c.frenadosOtros += 1
    }
    if (p.estado === 'despachado') {
      c.enTransito += 1
      if (alerta) c.atrasadosExpreso += 1
    }
    if (p.estado === 'incidencia') c.incidencias += 1
    const falt = faltantesDe(p, e)
    if (falt.includes('guia')) c.sinGuia += 1
    if (falt.includes('comprobante')) c.sinComprobante += 1
    // Solo los que siguen afuera: si se volvió atrás (a cargado/impreso) la fecha de despacho queda guardada.
    if (p.fecha_despacho === hoy && (p.estado === 'despachado' || p.estado === 'entregado' || p.estado === 'incidencia')) c.despachadosHoy += 1
    if (p.estado === 'entregado' && p.fecha_entrega && p.fecha_entrega >= mes[0] && p.fecha_entrega <= mes[1]) c.entregadosMes += 1
    const carga = p.created_at.slice(0, 10)
    if (carga >= mes[0] && carga <= mes[1]) c.cargadosMes += 1
  }
  return c
}

export interface TiemposExpreso {
  expreso: Expreso
  enviados: number
  /** Días hábiles promedio desde que se cargó el remito hasta que salió. */
  cargaADespacho: number | null
  /** Días hábiles promedio desde el despacho hasta la entrega. */
  despachoAEntrega: number | null
  aTiempo: number | null
  enTransito: number
}

function promedio(valores: number[]): number | null {
  if (!valores.length) return null
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10
}

/** Rendimiento por expreso en los pedidos que se le pasan (filtrar antes por período). */
export function tiemposPorExpreso(pedidos: Pedido[], expresos: Expreso[]): TiemposExpreso[] {
  return expresos.map((expreso) => {
    const propios = pedidos.filter((p) => p.expreso_id === expreso.id && p.fecha_despacho && p.estado !== 'cancelado')
    const cad = propios.map((p) => diasHabilesEntre(new Date(p.created_at), desdeISO(p.fecha_despacho!)))
    const entregados = propios.filter((p) => p.estado === 'entregado' && p.fecha_entrega)
    const dae = entregados.map((p) => diasHabilesEntre(desdeISO(p.fecha_despacho!), desdeISO(p.fecha_entrega!)))
    const aTiempo = dae.length ? Math.round((dae.filter((d) => d <= expreso.dias_esperados).length / dae.length) * 100) : null
    return {
      expreso,
      enviados: propios.length,
      cargaADespacho: promedio(cad),
      despachoAEntrega: promedio(dae),
      aTiempo,
      enTransito: propios.filter((p) => p.estado === 'despachado').length,
    }
  }).filter((t) => t.enviados > 0 || t.expreso.activo)
}
