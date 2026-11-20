import { alertaDe, estaAbierto, faltantesDe, pelotaEn } from './estados'
import { aISO, desdeISO, hoyISO, inicioSemana } from './fechas'
import type { Config, Estado, Expreso, Pedido, Pelota } from './types'

export type Periodo = 'todo' | 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'rango'
export type CampoFecha = 'carga' | 'despacho' | 'entrega'
export type Vista = 'abiertos' | 'todos' | 'atencion' | 'faltantes' | 'cerrados'

export interface Filtros {
  texto: string
  vista: Vista
  estados: Estado[]
  expresoId: string
  vendedorId: string
  pelota: Pelota | ''
  periodo: Periodo
  campoFecha: CampoFecha
  desde: string
  hasta: string
}

export const FILTROS_DEFAULT: Filtros = {
  texto: '',
  vista: 'abiertos',
  estados: [],
  expresoId: '',
  vendedorId: '',
  pelota: '',
  periodo: 'todo',
  campoFecha: 'carga',
  desde: '',
  hasta: '',
}

export const PERIODO_LABEL: Record<Periodo, string> = {
  todo: 'Cualquier fecha',
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  rango: 'Rango…',
}

export const VISTA_LABEL: Record<Vista, string> = {
  abiertos: 'En curso',
  atencion: 'Requieren atención',
  faltantes: 'Falta guía / firmado',
  cerrados: 'Cerrados',
  todos: 'Todos',
}

/** Rango [desde, hasta] inclusive en 'YYYY-MM-DD' para un período. */
export function rangoDe(periodo: Periodo, ahora: Date = new Date(), desde = '', hasta = ''): [string, string] | null {
  const hoy = hoyISO(ahora)
  switch (periodo) {
    case 'todo':
      return null
    case 'hoy':
      return [hoy, hoy]
    case 'semana': {
      const ini = inicioSemana(ahora)
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6)
      return [aISO(ini), aISO(fin)]
    }
    case 'mes': {
      const ini = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
      return [aISO(ini), aISO(fin)]
    }
    case 'mes_anterior': {
      const ini = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0)
      return [aISO(ini), aISO(fin)]
    }
    case 'rango':
      return desde || hasta ? [desde || '0000-01-01', hasta || '9999-12-31'] : null
  }
}

function fechaDe(p: Pedido, campo: CampoFecha): string | null {
  if (campo === 'despacho') return p.fecha_despacho
  if (campo === 'entrega') return p.fecha_entrega
  return aISO(new Date(p.created_at))
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function coincideTexto(p: Pedido, texto: string, expreso?: Expreso): boolean {
  const q = normalizar(texto.trim())
  if (!q) return true
  const qDigitos = q.replace(/\D/g, '')
  const campos = [p.cliente, p.n_remito, p.n_guia, p.localidad, p.provincia, p.direccion, p.telefono, p.contacto, p.cuit, expreso?.nombre, String(p.codigo)]
  const texto_ = normalizar(campos.filter(Boolean).join(' '))
  if (q.split(/\s+/).every((parte) => texto_.includes(parte))) return true
  // "5802" encuentra 0013-00005802
  if (qDigitos.length >= 3 && p.n_remito.replace(/\D/g, '').replace(/^0+/, '').includes(qDigitos.replace(/^0+/, ''))) return true
  return false
}

export function aplicarFiltros(pedidos: Pedido[], f: Filtros, expresos: Map<string, Expreso>, config: Config, ahora: Date = new Date()): Pedido[] {
  const rango = rangoDe(f.periodo, ahora, f.desde, f.hasta)
  return pedidos.filter((p) => {
    const expreso = p.expreso_id ? expresos.get(p.expreso_id) : undefined
    switch (f.vista) {
      case 'abiertos':
        if (!estaAbierto(p.estado)) return false
        break
      case 'cerrados':
        if (estaAbierto(p.estado)) return false
        break
      case 'atencion':
        if (!alertaDe(p, expreso, config, ahora)) return false
        break
      case 'faltantes':
        if (faltantesDe(p, expreso).length === 0) return false
        break
      case 'todos':
        break
    }
    if (f.estados.length && !f.estados.includes(p.estado)) return false
    if (f.expresoId && p.expreso_id !== f.expresoId) return false
    if (f.vendedorId && p.vendedor_id !== f.vendedorId) return false
    if (f.pelota && pelotaEn(p) !== f.pelota) return false
    if (rango) {
      const fecha = fechaDe(p, f.campoFecha)
      if (!fecha || fecha < rango[0] || fecha > rango[1]) return false
    }
    return coincideTexto(p, f.texto, expreso)
  })
}

export type Orden = 'reciente' | 'antiguo' | 'atencion'

/** Orden por defecto: primero lo que requiere atención, después lo más viejo en su estado. */
export function ordenar(pedidos: Pedido[], orden: Orden, expresos: Map<string, Expreso>, config: Config, ahora: Date = new Date()): Pedido[] {
  const copia = [...pedidos]
  if (orden === 'reciente') return copia.sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (orden === 'antiguo') return copia.sort((a, b) => a.estado_desde.localeCompare(b.estado_desde))
  const peso = (p: Pedido) => {
    const e = p.expreso_id ? expresos.get(p.expreso_id) : undefined
    if (alertaDe(p, e, config, ahora)) return 0
    if (estaAbierto(p.estado)) return 1
    return 2
  }
  return copia.sort((a, b) => peso(a) - peso(b) || a.estado_desde.localeCompare(b.estado_desde))
}

export function esFechaPasada(iso: string | null, ahora: Date = new Date()): boolean {
  return Boolean(iso && desdeISO(iso) < desdeISO(hoyISO(ahora)))
}
