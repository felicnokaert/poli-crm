// Firma digital del remito: se le da el celular al cliente, firma con el dedo y se completan nombre y DNI. Se guarda una constancia
// (imagen JPG) como «Remito firmado», que cuenta como comprobante. Así no hace falta imprimir el remito para que lo firmen.
import { Eraser, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { estamparFirma } from '../lib/firmaPdf' // la firma va ESTAMPADA en el PDF del remito (Felipe, 21/11)
import { useDatos } from '../lib/datos'
import { dniValido, firmaSuficiente, lineasConstancia, nombreArchivoFirma, nombreValido } from '../lib/firma'
import { depositoActual, operadorActual } from '../lib/operador'
import type { Pedido } from '../lib/types'
import { Modal, useToast } from './ui'

/** Une el texto y la firma en una sola imagen (fondo blanco, sirve impresa o en pantalla). */
function armarConstancia(firma: HTMLCanvasElement, datos: Parameters<typeof lineasConstancia>[0]): Promise<Blob> {
  const { titulo, lineas, items, pie } = lineasConstancia(datos)
  const ancho = 1000
  const alto = 260 + lineas.length * 34 + items.length * 30 + 300 + pie.length * 34 + 60
  const c = document.createElement('canvas')
  c.width = ancho
  c.height = alto
  const x = c.getContext('2d')
  if (!x) return Promise.reject(new Error('Este navegador no puede armar la imagen.'))
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, ancho, alto)
  x.fillStyle = '#111111'
  let y = 70
  x.font = 'bold 40px sans-serif'
  x.fillText('Grupo Poliplast', 50, y)
  y += 50
  x.font = 'bold 32px sans-serif'
  x.fillText(titulo, 50, y)
  y += 50
  x.font = '26px sans-serif'
  for (const l of lineas) { x.fillText(l, 50, y); y += 34 }
  if (items.length) {
    y += 10
    x.font = 'bold 24px sans-serif'
    x.fillText('Mercadería', 50, y)
    y += 32
    x.font = '22px sans-serif'
    for (const l of items) { x.fillText(l, 60, y); y += 30 }
  }
  y += 20
  x.strokeStyle = '#999999'
  x.strokeRect(50, y, ancho - 100, 260)
  x.drawImage(firma, 55, y + 5, ancho - 110, 250)
  y += 300
  x.font = '26px sans-serif'
  for (const l of pie) { x.fillText(l, 50, y); y += 34 }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la imagen.'))), 'image/jpeg', 0.85))
}

export function FirmaRemito({ pedido, onClose, onHecho, alFirmar }: {
  pedido: Pedido
  onClose: () => void
  onHecho: () => Promise<void>
  /** Si se puede marcar como retirado/entregado en el mismo paso. */
  alFirmar?: { label: string; hacer: () => Promise<void>; retiro?: boolean }
}) {
  const { yo } = useDatos()
  const avisar = useToast()
  const lienzo = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [puntos, setPuntos] = useState(0)
  const [nombre, setNombre] = useState(pedido.contacto ?? '')
  const [dni, setDni] = useState('')
  const [modo, setModo] = useState<'retiro' | 'entrega'>(alFirmar?.retiro ? 'retiro' : 'entrega')
  const [cerrar, setCerrar] = useState(Boolean(alFirmar))
  const [guardando, setGuardando] = useState(false)
  // remito con la firma estampada, para mirarlo antes de guardar
  const [previa, setPrevia] = useState<{ archivo: File; vista: string; pagina: number; hojaNueva: boolean } | null>(null)

  // El lienzo toma el ancho de la pantalla (el celular de costado firma mejor).
  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const escala = window.devicePixelRatio || 1
    const ancho = c.clientWidth || 600
    c.width = ancho * escala
    c.height = 220 * escala
    const x = c.getContext('2d')
    if (x) { x.scale(escala, escala); x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111' }
  }, [])

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    const x = e.currentTarget.getContext('2d')
    const p = punto(e)
    x?.beginPath()
    x?.moveTo(p.x, p.y)
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return
    const x = e.currentTarget.getContext('2d')
    const p = punto(e)
    x?.lineTo(p.x, p.y)
    x?.stroke()
    setPuntos((n) => n + 1)
  }
  function terminar() { dibujando.current = false }
  function borrar() {
    const c = lienzo.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setPuntos(0)
  }

  const nombreOk = nombreValido(nombre)
  const dniOk = dniValido(dni)
  const listo = Boolean(nombreOk && dniOk && firmaSuficiente(puntos))

  /** busca el PDF del remito del pedido (null si no tiene). */
  async function bajarRemito(): Promise<Uint8Array | null> {
    const det = await api.obtenerPedido(pedido.id)
    const r = det?.archivos.find((a) => a.tipo === 'remito' && ((a.mime ?? '').includes('pdf') || /\.pdf$/i.test(a.nombre)))
    if (!r) return null
    const resp = await fetch(await api.urlArchivo(r))
    if (!resp.ok) throw new Error('No pude bajar el PDF del remito. Probá de nuevo.')
    return new Uint8Array(await resp.arrayBuffer())
  }

  const datosFirma = () => ({ pedido, nombre: nombreOk!, dni: dniOk!, entrego: yo.operador || operadorActual() || yo.nombre, deposito: depositoActual(), momento: new Date(), modo })

  /** Paso 1: arma el remito firmado (o la constancia si el pedido no tiene PDF) y lo muestra. */
  async function preparar() {
    if (!listo || !lienzo.current || !nombreOk || !dniOk) return
    setGuardando(true)
    try {
      const datos = datosFirma()
      const remito = await bajarRemito().catch(() => null)
      if (remito) {
        const r = await estamparFirma(remito, lienzo.current, datos)
        const archivo = new File([new Uint8Array(r.pdf)], nombreArchivoFirma(pedido.n_remito).replace(/\.jpg$/, '.pdf'), { type: 'application/pdf' })
        setPrevia({ archivo, vista: r.vista, pagina: r.pagina, hojaNueva: r.hojaNueva })
      } else {
        const blob = await armarConstancia(lienzo.current, datos)
        const archivo = new File([blob], nombreArchivoFirma(pedido.n_remito), { type: 'image/jpeg' })
        setPrevia({ archivo, vista: URL.createObjectURL(blob), pagina: 0, hojaNueva: false })
      }
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }

  /** Paso 2: guarda lo que se vio. */
  async function guardar() {
    if (!previa || !nombreOk || !dniOk) return
    setGuardando(true)
    try {
      const nota = `Firmó ${modo === 'retiro' ? 'el retiro' : 'la recepción'}: ${nombreOk}, DNI ${dniOk} (firma digital${previa.pagina ? ' estampada en el remito' : ''}).`
      await api.subirArchivo(pedido.id, 'remito_firmado', previa.archivo)
      await api.comentar(pedido.id, nota)
      if (cerrar && alFirmar) await alFirmar.hacer()
      avisar('Remito firmado guardado')
      await onHecho()
      onClose()
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }


  return (
    <Modal titulo="Firma del remito" subtitulo={`Remito ${pedido.n_remito} · ${pedido.cliente}. Pasale el celular al cliente para que firme.`} onClose={onClose}
      pie={(
        <>
          {previa
            ? <button className="btn" onClick={() => setPrevia(null)} disabled={guardando}>Volver a firmar</button>
            : <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>}
          {previa
            ? <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}><PenLine size={16} /> {guardando ? 'Guardando…' : 'Guardar remito firmado'}</button>
            : <button className="btn btn-primary" onClick={() => void preparar()} disabled={!listo || guardando}><PenLine size={16} /> {guardando ? 'Preparando…' : 'Ver cómo queda'}</button>}
        </>
      )}>
      {previa && (
        <div className="firma-previa">
          <div className="aviso info small">{previa.pagina ? (previa.hojaNueva ? 'El remito no tenía lugar libre: la firma va en una hoja nueva al final.' : `Así queda el remito firmado (hoja ${previa.pagina}). Revisalo y tocá «Guardar».`) : 'Este pedido no tiene el PDF del remito: se guarda una constancia firmada.'}</div>
          <img src={previa.vista} alt="Remito firmado" style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8 }} />
        </div>
      )}
      <div style={{ display: previa ? 'none' : undefined }}>
      <div className="segmentado" role="group" aria-label="Cómo se entrega">
        <button type="button" className={`btn btn-sm${modo === 'retiro' ? ' btn-dark' : ''}`} onClick={() => setModo('retiro')}>Retira en el depósito</button>
        <button type="button" className={`btn btn-sm${modo === 'entrega' ? ' btn-dark' : ''}`} onClick={() => setModo('entrega')}>Lo recibe en destino</button>
      </div>
      <div className="label">Firma</div>
      <canvas ref={lienzo} className="firma-lienzo" aria-label="Espacio para firmar con el dedo"
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar} onPointerCancel={terminar} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted small">{firmaSuficiente(puntos) ? 'Firma lista.' : 'Firmá con el dedo dentro del recuadro.'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={borrar}><Eraser size={14} /> Borrar firma</button>
      </div>
      <label className="label" htmlFor="firma-nombre">Nombre y apellido de quien firma</label>
      <input id="firma-nombre" className="control" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      <label className="label" htmlFor="firma-dni">DNI</label>
      <input id="firma-dni" className="control" inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} autoComplete="off" />
      {dni && !dniOk && <div className="aviso warn">El DNI tiene que tener 7 u 8 números.</div>}
      {alFirmar && (
        <label className="check-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <input type="checkbox" checked={cerrar} onChange={(e) => setCerrar(e.target.checked)} /> {alFirmar.label}
        </label>
      )}
      </div>
    </Modal>
  )
}
