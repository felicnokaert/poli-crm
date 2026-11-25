// Máquina de estados de un pedido. La misma regla vive en la base (función entregas_transicion_ok
// en la migración): esto decide qué botones ve cada uno; la base es la que realmente autoriza.
import { desdeISO, diasHabilesEntre, hoyISO, horasHabilesEntre } from './fechas'
import type { Config, Estado, Expreso, MotivoBloqueo, MotivoIncidencia, Pedido, Pelota, Rol } from './types'

export const ESTADOS: Estado[] = ['cargado', 'impreso', 'bloqueado', 'despachado', 'entregado', 'incidencia', 'cancelado']

export const ESTADO_INFO: Record<Estado, { label: string; corto: string; tono: Tono; descripcion: string }> = {
  cargado: { label: 'Sin imprimir', corto: 'Sin imprimir', tono: 'pendiente', descripcion: 'El remito está en la app, expedición todavía no lo imprimió.' },
  impreso: { label: 'Impreso · en preparación', corto: 'Impreso', tono: 'info', descripcion: 'Expedición lo imprimió y lo está preparando.' },
  bloqueado: { label: 'Frenado', corto: 'Frenado', tono: 'alerta', descripcion: 'No puede salir hasta resolver el motivo.' },
  despachado: { label: 'Despachado', corto: 'Despachado', tono: 'transito', descripcion: 'Ya salió: está en manos del expreso.' },
  entregado: { label: 'Entregado', corto: 'Entregado', tono: 'ok', descripcion: 'El cliente lo recibió.' },
  incidencia: { label: 'Con problema', corto: 'Problema', tono: 'peligro', descripcion: 'Algo salió mal en el envío.' },
  cancelado: { label: 'Cancelado', corto: 'Cancelado', tono: 'neutro', descripcion: 'No se envía.' },
}

export type Tono = 'pendiente' | 'info' | 'alerta' | 'transito' | 'ok' | 'peligro' | 'neutro'

export const MOTIVOS_BLOQUEO: Record<MotivoBloqueo, { label: string; pelota: Pelota }> = {
  sin_stock: { label: 'Sin stock', pelota: 'expedicion' },
  falta_pago: { label: 'Falta pago', pelota: 'vendedor' },
  datos_incompletos: { label: 'Faltan datos de envío', pelota: 'vendedor' },
  otro: { label: 'Otro motivo', pelota: 'expedicion' },
}

export const MOTIVOS_INCIDENCIA: Record<MotivoIncidencia, { label: string; pelota: Pelota }> = {
  demora: { label: 'Demora del expreso', pelota: 'expreso' },
  danado: { label: 'Llegó dañado', pelota: 'expreso' },
  devuelto: { label: 'Devuelto por el expreso', pelota: 'expreso' },
  rechazado: { label: 'El cliente lo rechazó', pelota: 'vendedor' },
  direccion: { label: 'Dirección o contacto incorrecto', pelota: 'vendedor' },
  otro: { label: 'Otro problema', pelota: 'expreso' },
}

export const PELOTA_LABEL: Record<Exclude<Pelota, null>, string> = {
  vendedor: 'Vendedor',
  expedicion: 'Expedición',
  expreso: 'Expreso',
}

export const ROL_LABEL: Record<Rol, string> = { vendedor: 'Vendedor', expedicion: 'Expedición', admin: 'Administrador' }

interface Regla {
  de: Estado[]
  a: Estado
  roles: Rol[]
  /** Solo el vendedor dueño del pedido (además de los roles listados explícitamente). */
  soloDueno?: boolean
}

// Transiciones permitidas. El admin puede hacer cualquier transición (corregir errores).
const REGLAS: Regla[] = [
  { de: ['cargado'], a: 'impreso', roles: ['expedicion'] },
  { de: ['impreso'], a: 'cargado', roles: ['expedicion'] }, // deshacer "impreso"
  { de: ['cargado', 'impreso'], a: 'bloqueado', roles: ['expedicion', 'vendedor'] },
  { de: ['bloqueado'], a: 'cargado', roles: ['expedicion', 'vendedor'] }, // destrabar (vuelve a la cola)
  { de: ['bloqueado'], a: 'impreso', roles: ['expedicion'] },
  { de: ['cargado', 'impreso', 'bloqueado', 'incidencia'], a: 'despachado', roles: ['expedicion', 'vendedor'] },
  { de: ['despachado', 'incidencia'], a: 'entregado', roles: ['expedicion', 'vendedor'] },
  { de: ['despachado'], a: 'incidencia', roles: ['expedicion', 'vendedor'] },
  { de: ['cargado', 'impreso', 'bloqueado', 'incidencia'], a: 'cancelado', roles: ['vendedor'], soloDueno: true },
]

export function puedeTransicionar(de: Estado, a: Estado, rol: Rol, esDueno: boolean): boolean {
  if (de === a) return false
  if (rol === 'admin') return true
  return REGLAS.some((r) => r.a === a && r.de.includes(de) && r.roles.includes(rol) && (!r.soloDueno || esDueno))
}

export function transicionesDisponibles(pedido: Pick<Pedido, 'estado' | 'vendedor_id'>, rol: Rol, userId: string): Estado[] {
  const esDueno = pedido.vendedor_id === userId
  return ESTADOS.filter((a) => puedeTransicionar(pedido.estado, a, rol, esDueno))
}

/** De quién es el próximo paso. */
export function pelotaEn(p: Pick<Pedido, 'estado' | 'bloqueo_motivo' | 'incidencia_motivo'>): Pelota {
  switch (p.estado) {
    case 'cargado':
    case 'impreso':
      return 'expedicion'
    case 'bloqueado':
      return p.bloqueo_motivo ? MOTIVOS_BLOQUEO[p.bloqueo_motivo].pelota : 'expedicion'
    case 'despachado':
      return 'expreso'
    case 'incidencia':
      return p.incidencia_motivo ? MOTIVOS_INCIDENCIA[p.incidencia_motivo].pelota : 'expreso'
    default:
      return null
  }
}

export interface Alerta {
  tipo: 'sin_imprimir' | 'sin_despachar' | 'bloqueo_vencido' | 'bloqueo_largo' | 'atrasado_expreso' | 'incidencia'
  texto: string
}

/** Por qué este pedido necesita atención ahora (null = está dentro de los plazos). */
export function alertaDe(p: Pedido, expreso: Expreso | undefined, config: Config, ahora: Date = new Date()): Alerta | null {
  const desde = new Date(p.estado_desde)
  switch (p.estado) {
    case 'cargado': {
      const horas = horasHabilesEntre(new Date(p.created_at), ahora)
      return horas > config.horas_sin_imprimir ? { tipo: 'sin_imprimir', texto: `Sin imprimir hace ${formatoHoras(horas)}` } : null
    }
    case 'impreso': {
      const dias = diasHabilesEntre(desde, ahora)
      return dias > config.dias_sin_despachar ? { tipo: 'sin_despachar', texto: `Impreso hace ${dias} días hábiles y no salió: despachalo o frenalo e indicá por qué` } : null
    }
    case 'bloqueado': {
      if (p.stock_estimado && p.stock_estimado < hoyISO(ahora)) return { tipo: 'bloqueo_vencido', texto: 'Pasó la fecha estimada de stock' }
      const dias = diasHabilesEntre(desde, ahora)
      if (!p.stock_estimado && dias > config.dias_bloqueado) return { tipo: 'bloqueo_largo', texto: `Frenado hace ${dias} días hábiles` }
      return null
    }
    case 'despachado': {
      if (!p.fecha_despacho || !expreso) return null
      const dias = diasHabilesEntre(desdeISO(p.fecha_despacho), ahora)
      return dias > expreso.dias_esperados
        ? { tipo: 'atrasado_expreso', texto: `${dias} días hábiles en ${expreso.nombre} (esperado ${expreso.dias_esperados})` }
        : null
    }
    case 'incidencia':
      return { tipo: 'incidencia', texto: p.incidencia_motivo ? MOTIVOS_INCIDENCIA[p.incidencia_motivo].label : 'Problema en el envío' }
    default:
      return null
  }
}

function formatoHoras(h: number): string {
  if (h < 9) return `${Math.round(h)} h hábiles`
  const dias = Math.floor(h / 9)
  return dias === 1 ? '1 día hábil' : `${dias} días hábiles`
}

export type Faltante = 'guia' | 'comprobante'

/** Lo que falta adjuntar (no frena el circuito, pero se muestra). */
export function faltantesDe(p: Pedido, expreso: Expreso | undefined): Faltante[] {
  const salio = p.estado === 'despachado' || p.estado === 'entregado' || p.estado === 'incidencia'
  const out: Faltante[] = []
  const requiereGuia = expreso ? expreso.requiere_guia : true
  if (salio && requiereGuia && !p.n_guia && !p.tiene_guia_archivo) out.push('guia')
  // Con la guía (archivo o número) ya alcanza (Felipe, 20/11): el remito firmado se pide solo si no hay guía.
  if (p.estado === 'entregado' && !p.tiene_comprobante && !p.n_guia && !p.tiene_guia_archivo) out.push('comprobante')
  return out
}

export const FALTANTE_LABEL: Record<Faltante, string> = { guia: 'Sin guía', comprobante: 'Sin remito firmado' }

export function estaAbierto(estado: Estado): boolean {
  return estado !== 'entregado' && estado !== 'cancelado'
}

/** Texto de la acción para pasar a un estado (botones). */
export const ACCION_LABEL: Record<Estado, string> = {
  cargado: 'Volver a la cola',
  impreso: 'Marcar impreso',
  bloqueado: 'Frenar',
  despachado: 'Marcar despachado',
  entregado: 'Marcar entregado',
  incidencia: 'Reportar problema',
  cancelado: 'Cancelar pedido',
}

export function accionLabel(de: Estado, a: Estado): string {
  if (a === 'cargado' && de === 'impreso') return 'Deshacer impreso'
  if (a === 'cargado' && de === 'bloqueado') return 'Destrabar'
  if (a === 'cargado' && de === 'cancelado') return 'Reabrir'
  if (a === 'impreso' && de === 'bloqueado') return 'Destrabar (ya impreso)'
  if (a === 'despachado' && de === 'incidencia') return 'Re-despachar'
  return ACCION_LABEL[a]
}

// ---------------------------------------------------------------- Retira el cliente
// Cuando el cliente lo busca en el depósito no hay despacho ni guía: un solo botón «Lo retiró» lo deja entregado
// (por dentro pasa por despachado y entregado el mismo día, así el lead time y el historial siguen andando).

/** El expreso es «Retira el cliente» (no lleva guía y su nombre habla de retirar). */
export function esRetiroDelCliente(e: Pick<Expreso, 'nombre' | 'requiere_guia'> | undefined): boolean {
  return !!e && e.requiere_guia === false && /retir/i.test(e.nombre)
}

const ANTES_DEL_RETIRO: Estado[] = ['cargado', 'impreso', 'despachado']

/** Estados por los que pasa el pedido al tocar «Lo retiró» ([] si no corresponde o el rol no puede). */
export function pasosRetiro(p: Pick<Pedido, 'estado' | 'vendedor_id'>, e: Pick<Expreso, 'nombre' | 'requiere_guia'> | undefined,
  rol: Rol, userId: string): Estado[] {
  if (!esRetiroDelCliente(e) || !ANTES_DEL_RETIRO.includes(p.estado)) return []
  const esDueno = p.vendedor_id === userId
  const pasos: Estado[] = p.estado === 'despachado' ? ['entregado'] : ['despachado', 'entregado']
  let de = p.estado
  for (const a of pasos) {
    if (!puedeTransicionar(de, a, rol, esDueno)) return []
    de = a
  }
  return pasos
}
