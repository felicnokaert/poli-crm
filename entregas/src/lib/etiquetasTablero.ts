// PARCHE CONTEO: datos de ETIQUETAS (Mercado Libre) para el Tablero del depósito. Lo mismo que muestra la pestaña Etiquetas de la app:
// pendientes = lo que el CRM dice que está listo para despachar y todavía nadie escaneó (sin Full ni cancelados), por hora límite de despacho.
import { CLAVE, URL_BASE } from './expedicionApi'

export interface LineaEtq { sku?: string | null; qty?: number; description?: string | null }
export interface PendienteEtq { id: string; account?: string; logistic_type?: string; dispatch_by?: string | null; lines?: LineaEtq[] }
export interface DatosEtq { pendientes: PendienteEtq[]; vencidas: number; urgentes: number; escaneadasHoy: number; actualizado: number }

const H = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` }
const pad = (n: number) => String(n).padStart(2, '0')

/** Igual que limiteDespacho de Etiquetas.jsx: vencido / urgente (< 2 h) / hoy / ok. */
export function limite(iso: string | null | undefined, ahora = Date.now()): { txt: string; nivel: 'vencido' | 'urgente' | 'hoy' | 'ok'; t: number } | null {
  if (!iso) return null
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return null
  const d = new Date(t); const h = (t - ahora) / 3600000
  const mismoDia = new Date(ahora).toDateString() === d.toDateString()
  const txt = (mismoDia ? 'hoy ' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes())
  return { txt, nivel: h < 0 ? 'vencido' : h < 2 ? 'urgente' : mismoDia ? 'hoy' : 'ok', t }
}
export const tipoEnvio = (t?: string) => (t === 'self_service' ? 'Flex' : t === 'cross_docking' || t === 'xd_drop_off' ? 'Colecta' : '')

/** Junta pendientes y escaneos. Pura: se prueba sin red. */
type Envio = PendienteEtq & { full?: boolean; cancelled?: boolean }
export function armarEtq(shipments: Envio[], escaneos: { envio: string; creado: string }[], ahora = Date.now()): DatosEtq {
  const vistos = new Set(escaneos.map((e) => String(e.envio)))
  const inicioHoy = new Date(ahora); inicioHoy.setHours(0, 0, 0, 0)
  const pendientes = shipments
    .filter((s) => !s.full && !s.cancelled && !vistos.has(String(s.id)))
    .sort((a, b) => (limite(a.dispatch_by, ahora)?.t ?? Infinity) - (limite(b.dispatch_by, ahora)?.t ?? Infinity))
  const niv = (s: PendienteEtq) => limite(s.dispatch_by, ahora)?.nivel
  return {
    pendientes,
    vencidas: pendientes.filter((s) => niv(s) === 'vencido').length,
    urgentes: pendientes.filter((s) => niv(s) === 'urgente').length,
    escaneadasHoy: escaneos.filter((e) => new Date(e.creado).getTime() >= inicioHoy.getTime()).length,
    actualizado: ahora,
  }
}

export async function cargarEtq(): Promise<DatosEtq> {
  const desde = new Date(Date.now() - 3 * 86400000).toISOString()
  const [p, e] = await Promise.all([
    fetch(`${URL_BASE}/functions/v1/etiquetas-crm`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta: 'pending' }), signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
    fetch(`${URL_BASE}/rest/v1/etq_escaneos?select=envio,creado&creado=gte.${encodeURIComponent(desde)}&limit=2000`, { headers: H, signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
  ])
  if (!p || !p.ok) throw new Error('No puedo consultar Mercado Libre ahora.')
  return armarEtq(p.shipments || [], Array.isArray(e) ? e : [])
}
