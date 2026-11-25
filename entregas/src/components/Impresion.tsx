// Impresión de remitos: todo lo que entra queda listo para imprimir en tanda, con un solo toque o solo.
// - Cada pedido primero se "toma" (pasa a impreso en la base): si dos compus intentan a la vez, la base deja
//   pasar a una sola y no sale duplicado.
// - En la compu marcada "Esta compu imprime sola", lo nuevo se imprime apenas se carga (con una espera corta
//   para juntar los que se suben seguidos).
import { Printer, Undo2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mensajeError } from '../lib/api'
import { api, CON_IMPRIMIR } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { puedeTransicionar } from '../lib/estados'
import { imprimeSolo, imprimirPaginas, paginasDeArchivo, setImprimeSolo } from '../lib/impresion'
import type { Pedido } from '../lib/types'
import { useToast } from './ui'

/** Espera desde la última carga antes de imprimir solo (junta los remitos que se suben seguidos). */
const ESPERA_MS = 15_000
/** Un pedido recién creado puede tener el archivo todavía subiéndose. */
const EDAD_MINIMA_MS = 20_000

interface Impresion {
  /** Pedidos cargados que todavía no se imprimieron. */
  pendientes: Pedido[]
  /** Los que no tienen el PDF del remito (no se pueden imprimir desde acá). */
  sinArchivo: Set<string>
  trabajando: boolean
  puedeImprimir: boolean
  auto: boolean
  setAuto: (si: boolean) => void
  imprimir: (pedidos: Pedido[]) => Promise<void>
  /** Últimos que se mandaron a imprimir (para "No salieron: volver a la cola"). */
  ultima: Pedido[]
  deshacerUltima: () => Promise<void>
  /** «No salieron»: vuelven a la cola y se imprimen de nuevo. */
  reimprimirUltima: () => Promise<void>
  /** «Sí, salieron»: deja de preguntar. */
  confirmarUltima: () => void
}

const Ctx = createContext<Impresion | null>(null)

export function ImpresionProvider({ children }: { children: ReactNode }) {
  const { yo, pedidos, recargar } = useDatos()
  const avisar = useToast()
  const [auto, setAutoEstado] = useState(imprimeSolo())
  const [trabajando, setTrabajando] = useState(false)
  const [sinArchivo, setSinArchivo] = useState<Set<string>>(new Set())
  const [ultima, setUltima] = useState<Pedido[]>([])
  const ocupado = useRef(false)

  // Solo expedición imprime, desde la app de conteo (25/11): en el CRM no se imprime ni sola ni a mano.
  const puedeImprimir = CON_IMPRIMIR && puedeTransicionar('cargado', 'impreso', yo.rol, false)
  const pendientes = useMemo(
    () => pedidos.filter((p) => p.estado === 'cargado').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pedidos],
  )

  const setAuto = useCallback((si: boolean) => { setImprimeSolo(si); setAutoEstado(si) }, [])

  const imprimir = useCallback(async (lista: Pedido[]) => {
    if (ocupado.current || !lista.length) return
    ocupado.current = true
    setTrabajando(true)
    const tomados: Pedido[] = []
    const paginas: string[] = []
    const faltan = new Set<string>()
    try {
      for (const p of lista) {
        const det = await api.obtenerPedido(p.id)
        const remito = det?.archivos.find((a) => a.tipo === 'remito')
        if (!det || det.pedido.estado !== 'cargado') continue // ya lo tomó otra compu
        if (!remito) { faltan.add(p.id); continue }
        try {
          await api.cambiarEstado(p.id, 'impreso')
        } catch {
          continue // otra compu lo imprimió recién
        }
        try {
          const url = await api.urlArchivo(remito)
          paginas.push(...await paginasDeArchivo(url, remito.mime, remito.nombre))
          tomados.push(p)
        } catch (e) {
          await api.cambiarEstado(p.id, 'cargado').catch(() => undefined)
          avisar(`No se pudo preparar el remito de ${p.cliente}: ${mensajeError(e)}`, true)
        }
      }
      if (faltan.size) setSinArchivo((s) => new Set([...s, ...faltan]))
      if (paginas.length) {
        await imprimirPaginas(paginas)
        setUltima(tomados)
        avisar(tomados.length === 1 ? `Remito de ${tomados[0].cliente} impreso` : `${tomados.length} remitos impresos`)
      }
    } catch (e) {
      if (tomados.length) await Promise.all(tomados.map((p) => api.cambiarEstado(p.id, 'cargado').catch(() => undefined)))
      avisar(mensajeError(e), true)
    } finally {
      ocupado.current = false
      setTrabajando(false)
      await recargar()
    }
  }, [avisar, recargar])

  const deshacerUltima = useCallback(async () => {
    const lista = ultima
    setUltima([])
    try {
      for (const p of lista) await api.cambiarEstado(p.id, 'cargado')
      avisar(lista.length === 1 ? 'Volvió a la cola para imprimir' : `${lista.length} volvieron a la cola para imprimir`)
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      await recargar()
    }
  }, [ultima, avisar, recargar])

  const reimprimirUltima = useCallback(async () => {
    const lista = ultima
    setUltima([])
    try {
      for (const p of lista) await api.cambiarEstado(p.id, 'cargado')
    } catch (e) {
      avisar(mensajeError(e), true)
      await recargar()
      return
    }
    await imprimir(lista)
  }, [ultima, avisar, recargar, imprimir])

  const confirmarUltima = useCallback(() => setUltima([]), [])

  // Impresión sola: cuando hay remitos nuevos con archivo, espera un poco (por si suben más) e imprime todos.
  const listos = useMemo(() => pendientes.filter((p) => !sinArchivo.has(p.id)), [pendientes, sinArchivo])
  const firma = listos.map((p) => p.id).join(',')
  useEffect(() => {
    if (!auto || !puedeImprimir || trabajando || !listos.length) return
    const ahora = Date.now()
    const masNuevo = Math.max(...listos.map((p) => new Date(p.created_at).getTime()))
    const espera = Math.max(ESPERA_MS, masNuevo + EDAD_MINIMA_MS - ahora)
    const t = window.setTimeout(() => void imprimir(listos), espera)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, puedeImprimir, trabajando, firma, imprimir])

  const valor = useMemo<Impresion>(() => ({
    pendientes, sinArchivo, trabajando, puedeImprimir, auto, setAuto, imprimir, ultima, deshacerUltima, reimprimirUltima, confirmarUltima,
  }), [pendientes, sinArchivo, trabajando, puedeImprimir, auto, setAuto, imprimir, ultima, deshacerUltima, reimprimirUltima, confirmarUltima])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useImpresion(): Impresion {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useImpresion fuera de ImpresionProvider')
  return ctx
}

/** Barra de Expedición: lo nuevo para imprimir, el botón de tanda y si esta compu imprime sola. */
export function BarraImpresion() {
  const { pendientes, sinArchivo, trabajando, puedeImprimir, auto, setAuto, imprimir, ultima, reimprimirUltima, confirmarUltima } = useImpresion()
  const [ayuda, setAyuda] = useState(false)
  if (!puedeImprimir) return null
  const imprimibles = pendientes.filter((p) => !sinArchivo.has(p.id))
  const faltan = pendientes.filter((p) => sinArchivo.has(p.id))

  return (
    <div className="panel imp-barra">
      <div className="imp-fila">
        <Printer size={18} />
        <div className="imp-texto">
          {trabajando ? <b>Imprimiendo…</b>
            : imprimibles.length ? <b>{imprimibles.length} remito{imprimibles.length === 1 ? '' : 's'} nuevo{imprimibles.length === 1 ? '' : 's'} para imprimir</b>
            : <b>No hay remitos nuevos para imprimir</b>}
          <span className="small muted">
            {auto ? 'Esta compu los imprime sola apenas se cargan.' : 'Se imprimen todos juntos y pasan a "Para despachar".'}
          </span>
        </div>
        {imprimibles.length > 0 && !auto && (
          <button className="btn" disabled={trabajando} onClick={() => setAuto(true)}>Que esta compu imprima sola</button>
        )}
        {imprimibles.length > 0 && (
          <button className="btn btn-dark" disabled={trabajando} onClick={() => void imprimir(imprimibles)}>
            <Printer size={15} /> Imprimir {imprimibles.length === 1 ? '' : 'todos'}
          </button>
        )}
      </div>

      {ultima.length > 0 && !trabajando && (
        <div className="aviso warn imp-pregunta">
          <span><b>{ultima.length === 1 ? `¿Salió el remito de ${ultima[0].cliente}?` : `¿Salieron los ${ultima.length} remitos?`}</b> Fijate en la impresora.</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm btn-dark" onClick={confirmarUltima}>Sí, salieron</button>
            <button className="btn btn-sm" onClick={() => void reimprimirUltima()}><Undo2 size={13} /> No, imprimir de nuevo</button>
          </span>
        </div>
      )}

      {faltan.length > 0 && (
        <div className="aviso warn small">
          Sin el PDF del remito (no se pueden imprimir desde acá): {faltan.map((p) => p.cliente).join(', ')}. Están en «Para despachar».
        </div>
      )}

      <div className="imp-fila small">
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--ink)' }} />
          Esta compu imprime sola los remitos nuevos
        </label>
        <button className="link-btn small muted" onClick={() => setAyuda((a) => !a)}>{ayuda ? 'Ocultar' : 'Cómo que salga sin preguntar'}</button>
      </div>
      {ayuda && (
        <div className="aviso info small" style={{ display: 'block' }}>
          Tildalo en <b>una sola compu</b> (la de la impresora) y dejá la app abierta. Para que imprima sin mostrar el cuadro
          de impresión: cerrá Chrome, hacé clic derecho en el acceso directo de Chrome → Propiedades, y al final de «Destino»
          agregá <span className="mono">--kiosk-printing</span> (después de las comillas, con un espacio). Abrí Chrome desde ese
          acceso y entrá a Entregas: los remitos salen solos por la impresora predeterminada.
        </div>
      )}
    </div>
  )
}
