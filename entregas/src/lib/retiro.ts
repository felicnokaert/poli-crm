// «Lo retiró»: el cliente buscó el pedido en el depósito. Lo deja entregado hoy en un solo toque.
import type { Api } from './api'
import { hoyISO } from './fechas'
import type { Estado, Pedido } from './types'

export async function marcarRetirado(api: Pick<Api, 'cambiarEstado'>, p: Pick<Pedido, 'id'>, pasos: Estado[], hoy = hoyISO()): Promise<void> {
  for (const a of pasos) {
    if (a === 'despachado') await api.cambiarEstado(p.id, 'despachado', { fecha_despacho: hoy }, 'Lo retiró el cliente')
    else if (a === 'entregado') await api.cambiarEstado(p.id, 'entregado', { fecha_entrega: hoy }, 'Lo retiró el cliente')
  }
}
