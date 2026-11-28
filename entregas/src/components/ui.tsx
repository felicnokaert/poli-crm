import {
  AlertTriangle, CheckCircle2, CircleDashed, Ban, PackageCheck, Printer, Truck, X, PauseCircle, type LucideIcon,
} from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ESTADO_INFO, FALTANTE_LABEL, MOTIVOS_BLOQUEO, PELOTA_LABEL, type Faltante } from '../lib/estados'
import type { Estado, Pedido, Pelota } from '../lib/types'

export const ICONO_ESTADO: Record<Estado, LucideIcon> = {
  cargado: CircleDashed,
  impreso: Printer,
  bloqueado: PauseCircle,
  despachado: Truck,
  entregado: PackageCheck,
  incidencia: AlertTriangle,
  cancelado: Ban,
}

export function EstadoChip({ pedido, estado, corto }: { pedido?: Pick<Pedido, 'estado' | 'bloqueo_motivo'>; estado?: Estado; corto?: boolean }) {
  const e = estado ?? pedido!.estado
  const info = ESTADO_INFO[e]
  const Icono = ICONO_ESTADO[e]
  let texto = corto ? info.corto : info.label
  if (pedido && e === 'bloqueado' && pedido.bloqueo_motivo) texto = MOTIVOS_BLOQUEO[pedido.bloqueo_motivo].label
  return (
    <span className={`chip tono-${info.tono}`}>
      <Icono size={13} aria-hidden /> {texto}
    </span>
  )
}

export function PelotaTag({ pelota, prefijo = true }: { pelota: Pelota; prefijo?: boolean }) {
  if (!pelota) return <span className="pelota muted"><CheckCircle2 size={13} aria-hidden /> Cerrado</span>
  return (
    <span className={`pelota p-${pelota}`} title="De quién es el próximo paso">
      <i aria-hidden /> {prefijo ? 'Le toca a ' : ''}{PELOTA_LABEL[pelota].toLowerCase()}
    </span>
  )
}

export function Faltantes({ lista }: { lista: Faltante[] }) {
  if (!lista.length) return null
  return (
    <>
      {lista.map((f) => (
        <span key={f} className="chip tono-pendiente chip-outline">{FALTANTE_LABEL[f]}</span>
      ))}
    </>
  )
}

/** Desde qué depósito sale (25/11, Felipe: «que se diferencie en colores»): Villa Domínico azul, Mar del Plata naranja, otro gris. */
export function tonoDeposito(d: string | null | undefined): 'vd' | 'mdp' | 'otro' {
  const k = String(d ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (k.includes('dominico')) return 'vd'
  if (k.includes('mar del plata') || k.includes('mardel')) return 'mdp'
  return 'otro'
}

export function DepositoChip({ deposito, corto }: { deposito: string | null | undefined; corto?: boolean }) {
  if (!deposito) return null
  const tono = tonoDeposito(deposito)
  const texto = corto && tono !== 'otro' ? (tono === 'vd' ? 'V. Domínico' : 'Mar del Plata') : deposito
  return <span className={`chip dep-${tono}`} title={`Sale desde ${deposito}`}>{texto}</span>
}

/** Lo que ya está resuelto (21/11): el vendedor ve en la lista que su pedido tiene guía o remito firmado sin entrar ni preguntar. */
export function Listos({ pedido: p }: { pedido: Pick<Pedido, 'n_guia' | 'tiene_guia_archivo' | 'tiene_comprobante' | 'estado'> }) {
  const guia = Boolean(p.n_guia || p.tiene_guia_archivo)
  if (!guia && !p.tiene_comprobante) return null
  return (
    <>
      {guia && <span className="chip tono-ok" title="Ya tiene número de guía o el archivo de la guía">Guía lista</span>}
      {p.tiene_comprobante && <span className="chip tono-ok" title="Tiene el remito firmado o el comprobante">Firmado</span>}
    </>
  )
}

export function Empty({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icono size={34} aria-hidden />
      <b>{titulo}</b>
      {children}
    </div>
  )
}

export function Modal({ titulo, subtitulo, onClose, children, pie }: {
  titulo: string
  subtitulo?: ReactNode
  onClose: () => void
  children: ReactNode
  pie?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', tecla)
    const previo = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button.opcion')?.focus()
    return () => { window.removeEventListener('keydown', tecla); previo?.focus?.() }
  }, [onClose])
  // Se dibuja directo en <body>: dentro de la página, una animación con transform la dejaba fuera de la pantalla en el celular.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {pie && <div className="modal-foot">{pie}</div>}
      </div>
    </div>,
    destinoFlotante(),
  )
}

/**
 * Dónde se dibujan las ventanas: en <body>. Dentro de Poliplast App (módulo nativo, estilos encerrados en `.ent-nativo`)
 * van en una capa propia con esa clase, así conservan su diseño.
 */
function destinoFlotante(): HTMLElement {
  if (!document.querySelector('.ent-nativo')) return document.body
  let capa = document.getElementById('ent-nativo-capa')
  if (!capa) {
    capa = document.createElement('div')
    capa.id = 'ent-nativo-capa'
    capa.className = 'ent-nativo embebido marco-poliplast ent-capa'
    document.body.appendChild(capa)
  }
  return capa
}

// ---------------------------------------------------------------- Avisos flotantes
interface Toast { id: number; texto: string; error?: boolean }
const ToastCtx = createContext<(texto: string, error?: boolean) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const avisar = useCallback((texto: string, error = false) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, texto, error }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' err' : ''}`}>
            {t.error ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/** Copia texto al portapapeles con aviso. */
export function useCopiar() {
  const avisar = useToast()
  return useCallback(async (texto: string, ok = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar(ok)
    } catch {
      avisar('No se pudo copiar: seleccioná el texto a mano', true)
    }
  }, [avisar])
}

/** Tipos de archivo que se aceptan para guías, remitos firmados y fotos: PDF y cualquier imagen. */
export const ACEPTA_ARCHIVOS = 'image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif'

/** 26/11 (Felipe: «en la compu no me abras la cámara»): solo en un celular o tablet (pantalla táctil, dedo) se ofrece «Sacar foto». */
export function esCelular(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints ?? 0) > 0 } catch { return false }
}

/** Para que un botón de subir acepte también un archivo arrastrado encima (en la compu). */
export function soltable(alSoltar: (archivos: FileList) => void) {
  return {
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer.files.length) alSoltar(e.dataTransfer.files) },
  }
}
