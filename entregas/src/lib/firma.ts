// Firma digital del remito (21/11, idea de Felipe: «dejar de gastar tantas hojas»). Cuando el cliente retira o recibe, se le da el
// celular, firma con el dedo y se completan nombre y DNI. Queda una CONSTANCIA de recepción (imagen) que se guarda como «Remito
// firmado»: cuenta como comprobante igual que la foto del papel firmado. Acá van las partes que no dependen de la pantalla.
import type { Pedido } from './types'

/** DNI argentino: 7 u 8 números (se aceptan puntos y espacios). Devuelve solo los números o null si no sirve. */
export function dniValido(texto: string): string | null {
  const d = String(texto || '').replace(/[\s.]/g, '')
  return /^\d{7,8}$/.test(d) ? d : null
}

/** 12.345.678 */
export function dniLegible(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Nombre y apellido: al menos dos palabras de 2 letras. */
export function nombreValido(texto: string): string | null {
  const n = String(texto || '').trim().replace(/\s+/g, ' ')
  const palabras = n.split(' ').filter((w) => /\p{L}{2,}/u.test(w))
  return palabras.length >= 2 && n.length <= 80 ? n : null
}

/** La firma tiene que tener algo de trazo (no un toque suelto): al menos 12 puntos dibujados. */
export function firmaSuficiente(puntos: number): boolean {
  return puntos >= 12
}

export interface DatosConstancia {
  pedido: Pick<Pedido, 'n_remito' | 'cliente' | 'cuit' | 'items' | 'codigo'>
  nombre: string
  dni: string
  /** Quién entregó (persona de expedición o vendedor). */
  entrego: string
  deposito?: string | null
  momento: Date
  /** Retira en el depósito o lo recibe en destino. */
  modo: 'retiro' | 'entrega'
}

const fechaHoraAr = (d: Date) => d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Renglones de texto de la constancia (arriba de la firma). */
export function lineasConstancia(d: DatosConstancia): { titulo: string; lineas: string[]; items: string[]; pie: string[] } {
  const items = (d.pedido.items || []).slice(0, 14).map((i) => `${i.cantidad} × ${[i.codigo, i.descripcion].filter(Boolean).join(' · ')}`.slice(0, 90))
  if ((d.pedido.items || []).length > 14) items.push(`… y ${d.pedido.items.length - 14} renglones más (ver remito)`)
  return {
    titulo: d.modo === 'retiro' ? 'Constancia de retiro' : 'Constancia de recepción',
    lineas: [
      `Remito ${d.pedido.n_remito} · Pedido #${d.pedido.codigo}`,
      `Cliente: ${d.pedido.cliente}${d.pedido.cuit ? ` (CUIT ${d.pedido.cuit})` : ''}`,
      `Fecha y hora: ${fechaHoraAr(d.momento)}`,
    ],
    items,
    pie: [
      `Recibí conforme la mercadería del remito ${d.pedido.n_remito}.`,
      `Aclaración: ${d.nombre}`,
      `DNI: ${dniLegible(d.dni)}`,
      `Entregó: ${d.entrego}${d.deposito ? ` · ${d.deposito}` : ''}`,
    ],
  }
}

/** Nombre del archivo que se guarda: remito-firmado-0006-00006361.jpg */
export function nombreArchivoFirma(nRemito: string): string {
  return `remito-firmado-${String(nRemito || 'sin-numero').replace(/[^\w-]+/g, '-')}.jpg`
}
