// Diálogo para pasar uno o varios pedidos a otro estado, pidiendo solo los datos que ese estado necesita.
import { Camera, Paperclip } from 'lucide-react'
import { limpiarCamara, marcarCamara } from '../lib/camaraPendiente'
import { useState } from 'react'
import { mensajeError } from '../lib/api'
import { api, TIPOS_SUBIDA } from '../lib/cliente' // en conteo solo guía, remito y remito firmado (sin fotos sueltas)
import { detectarGuia } from '../lib/leerGuia'
import { CamposGuia } from './CamposGuia'
import { useDatos } from '../lib/datos'
import { accionLabel, ESTADO_INFO, MOTIVOS_BLOQUEO, MOTIVOS_INCIDENCIA } from '../lib/estados'
import { hoyISO } from '../lib/fechas'
import type { DatosCambio, Estado, MotivoBloqueo, MotivoIncidencia, Pedido, TipoArchivo } from '../lib/types'
import { Modal, useToast } from './ui'

// Estados que se pueden confirmar con un clic (sin datos extra).
export const DIRECTOS: Estado[] = ['impreso', 'cargado']

export function CambioEstado({ pedidos, a, onClose, onHecho }: {
  pedidos: Pedido[]
  a: Estado
  onClose: () => void
  onHecho?: () => void
}) {
  const { expresos, recargar } = useDatos()
  const avisar = useToast()
  const uno = pedidos.length === 1 ? pedidos[0] : null
  const de = pedidos[0].estado

  const [motivoB, setMotivoB] = useState<MotivoBloqueo>('sin_stock')
  const [detalle, setDetalle] = useState('')
  const [stockEst, setStockEst] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [guia, setGuia] = useState(uno?.n_guia ?? '')
  const [bultos, setBultos] = useState(uno?.bultos ? String(uno.bultos) : '')
  const [expresoId, setExpresoId] = useState(uno?.expreso_id ?? '')
  const [motivoI, setMotivoI] = useState<MotivoIncidencia>('demora')
  const [nota, setNota] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [leyendoGuia, setLeyendoGuia] = useState(false)
  const [guiaLeida, setGuiaLeida] = useState<string | null>(null)

  // Al adjuntar la foto de la guía, intenta leer el número y lo propone en el campo.
  function adjuntar(f: File | null) {
    setArchivo(f)
    if (!f || tipoAdjunto !== 'guia' || !uno || guia.trim()) return
    setLeyendoGuia(true)
    void detectarGuia(f).then((r) => {
      if (!r) return
      setGuia((prev) => (prev.trim() ? prev : r.numero))
      setGuiaLeida(r.numero)
    }).finally(() => setLeyendoGuia(false))
  }
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tipoAdjunto: TipoArchivo | null = a === 'despachado' ? 'guia' : a === 'entregado' ? 'remito_firmado' : a === 'incidencia' ? 'foto' : null

  async function confirmar() {
    setError(null)
    const datos: DatosCambio = {}
    if (a === 'bloqueado') {
      datos.bloqueo_motivo = motivoB
      datos.bloqueo_detalle = detalle || null
      if (motivoB === 'sin_stock' && stockEst) datos.stock_estimado = stockEst
    }
    if (a === 'despachado') {
      if (!fecha) { setError('Elegí la fecha de despacho.'); return }
      datos.fecha_despacho = fecha
      if (uno) {
        datos.n_guia = guia.trim() || null
        datos.bultos = bultos ? Number(bultos) : null
      }
      if (expresoId && uno && expresoId !== uno.expreso_id) datos.expreso_id = expresoId
    }
    if (a === 'entregado') datos.fecha_entrega = fecha
    if (a === 'incidencia') {
      datos.incidencia_motivo = motivoI
      datos.incidencia_detalle = detalle || null
    }
    setGuardando(true)
    try {
      for (const p of pedidos) {
        await api.cambiarEstado(p.id, a, datos, nota || null)
        if (archivo && tipoAdjunto && uno) await api.subirArchivo(p.id, tipoAdjunto, archivo)
      }
      avisar(pedidos.length > 1 ? `${pedidos.length} pedidos → ${ESTADO_INFO[a].corto}` : `Listo: ${ESTADO_INFO[a].corto.toLowerCase()}`)
      await recargar()
      onHecho?.()
      onClose()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const titulo = accionLabel(de, a)
  const subtitulo = uno ? `Remito ${uno.n_remito} · ${uno.cliente}` : `${pedidos.length} pedidos seleccionados`

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      onClose={onClose}
      pie={(
        <>
          <button className="btn" onClick={onClose}>Volver</button>
          <button className={`btn ${a === 'cancelado' ? 'btn-dark' : 'btn-primary'}`} onClick={() => void confirmar()} disabled={guardando}>
            {guardando ? 'Guardando…' : titulo}
          </button>
        </>
      )}
    >
      {a === 'bloqueado' && (
        <>
          <div className="field">
            <span>¿Por qué no puede salir?</span>
            <div className="opciones">
              {(Object.keys(MOTIVOS_BLOQUEO) as MotivoBloqueo[]).map((m) => (
                <button key={m} type="button" className="opcion" aria-pressed={motivoB === m} onClick={() => setMotivoB(m)}>
                  <span><b>{MOTIVOS_BLOQUEO[m].label}</b><small>Lo resuelve: {MOTIVOS_BLOQUEO[m].pelota === 'vendedor' ? 'el vendedor' : 'expedición / compras'}</small></span>
                </button>
              ))}
            </div>
          </div>
          {motivoB === 'sin_stock' && (
            <label className="field">
              <span>¿Para cuándo se espera el stock? <span className="hint">(opcional, pero ayuda a responderle al cliente)</span></span>
              <input className="control" type="date" min={hoyISO()} value={stockEst} onChange={(e) => setStockEst(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Detalle {motivoB === 'otro' ? '' : <span className="hint">(opcional)</span>}</span>
            <input className="control" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={motivoB === 'sin_stock' ? 'Ej: falta Poli-Plus 740 x 25 kg' : ''} />
          </label>
        </>
      )}

      {a === 'despachado' && (
        <>
          <div className="grid-2">
            <label className="field">
              <span>Fecha de despacho</span>
              <input className="control" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
            </label>
            {uno && (
              <label className="field">
                <span>Expreso</span>
                <select className="control" value={expresoId} onChange={(e) => setExpresoId(e.target.value)}>
                  <option value="">—</option>
                  {expresos.filter((x) => x.activo || x.id === expresoId).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
            )}
          </div>
          {uno && (
            <div className="grid-2">
              <CamposGuia valor={guia} onChange={setGuia}
                pista={leyendoGuia ? '(leyendo la foto…)' : guiaLeida && guia === guiaLeida ? '(leído de la foto: revisalo)' : '(si ya la tenés, o sacale foto abajo)'} />
              <label className="field">
                <span>Bultos</span>
                <input className="control" type="number" min={0} max={999} value={bultos} onChange={(e) => setBultos(e.target.value)} />
              </label>
            </div>
          )}
          {!archivo && <span className="hint">Si la cámara no vuelve con la foto, usá «Adjuntar archivo» y elegila de la galería.</span>}
          {!uno && <p className="muted small" style={{ margin: 0 }}>La guía de cada uno se carga después, desde el pedido.</p>}
        </>
      )}

      {a === 'entregado' && (
        <label className="field">
          <span>Fecha de entrega</span>
          <input className="control" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
        </label>
      )}

      {a === 'incidencia' && (
        <>
          <div className="field">
            <span>¿Qué pasó?</span>
            <div className="opciones">
              {(Object.keys(MOTIVOS_INCIDENCIA) as MotivoIncidencia[]).map((m) => (
                <button key={m} type="button" className="opcion" aria-pressed={motivoI === m} onClick={() => setMotivoI(m)}>
                  <span><b>{MOTIVOS_INCIDENCIA[m].label}</b></span>
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Detalle</span>
            <input className="control" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
        </>
      )}

      {a === 'cancelado' && <div className="aviso warn">El pedido sale de las listas en curso. Queda en el historial y un admin lo puede reabrir.</div>}

      {tipoAdjunto && (!TIPOS_SUBIDA || TIPOS_SUBIDA.includes(tipoAdjunto)) && uno && (
        <div className="field">
          <span>
            {tipoAdjunto === 'guia' ? 'Foto o PDF de la guía' : tipoAdjunto === 'remito_firmado' ? 'Remito firmado / comprobante de entrega' : 'Foto del problema'}{' '}
            <span className="hint">(opcional)</span>
          </span>
          {archivo ? (
            <div className="archivo-cargado"><Paperclip size={16} /> <span className="small">{archivo.name}</span><span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => setArchivo(null)}>Quitar</button></div>
          ) : (
            <div className="row">
              <label className="btn btn-sm">
                <Camera size={15} /> Sacar foto
                <input type="file" accept="image/*" capture="environment" hidden onClick={() => marcarCamara(uno.codigo, tipoAdjunto)}
                  onChange={(e) => { limpiarCamara(); adjuntar(e.target.files?.[0] ?? null); e.target.value = '' }} />
              </label>
              <label className="btn btn-sm">
                <Paperclip size={15} /> Adjuntar archivo
                <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { adjuntar(e.target.files?.[0] ?? null); e.target.value = '' }} />
              </label>
            </div>
          )}
        </div>
      )}

      <label className="field">
        <span>{a === 'cancelado' ? 'Motivo' : 'Nota para el historial'} <span className="hint">(opcional)</span></span>
        <input className="control" value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>

      {error && <div className="aviso err">{error}</div>}
    </Modal>
  )
}
