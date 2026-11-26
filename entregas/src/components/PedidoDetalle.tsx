import {
  AlertCircle, ArrowLeft, Copy, ExternalLink, FileText, HandCoins, Image as ImageIcon, Link2, MessageCircle, MessageSquare, Paperclip,
  Mail, Pencil, PenLine, PlusCircle, Printer, Send, Share2, Trash2, Truck,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { mensajeError, type DetallePedido } from '../lib/api'
import { api, CON_SUBIR } from '../lib/cliente'
import { useDatos, useNombre } from '../lib/datos'
import {
  accionLabel, alertaDe, ESTADO_INFO, FALTANTE_LABEL, faltantesDe, MOTIVOS_BLOQUEO, MOTIVOS_INCIDENCIA, pasosRetiro, pelotaEn, transicionesDisponibles,
} from '../lib/estados'
import { fechaCorta, fechaHora, fechaLarga, hace } from '../lib/fechas'
import { asuntoCliente, guiaLegible, guiaSeCopia, linkMail, linkPedido, linkSeguimiento, linkWhatsApp, mensajeCliente, numeroSeguir, partesGuia, textoPlano } from '../lib/mensajes'
import { hoyISO } from '../lib/fechas'
import { camaraPendiente, limpiarCamara, marcarCamara } from '../lib/camaraPendiente'
import { FirmaRemito } from './FirmaRemito'
import { marcarRetirado } from '../lib/retiro'
import type { Archivo, CamposEditables, Estado, Evento, Pedido, TipoArchivo } from '../lib/types'
import { CambioEstado, DIRECTOS } from './CambioEstado'
import { ItemsMini } from './NuevoRemito'
import { CamposGuia } from './CamposGuia'
import { DepositoSalida } from './DepositoSalida'
import { useLeerGuia } from './ConfirmarGuia'
import { RelojLead } from './LeadTime'
import { leadTime } from '../lib/leadtime'
import { ACEPTA_ARCHIVOS, esCelular, DepositoChip, Empty, EstadoChip, Faltantes, ICONO_ESTADO, Modal, PelotaTag, soltable, useCopiar, useToast } from './ui'

export const TIPO_ARCHIVO_LABEL: Record<TipoArchivo, string> = {
  remito: 'Remito',
  guia: 'Guía del expreso',
  remito_firmado: 'Remito firmado',
  foto: 'Foto',
  otro: 'Otro',
}

/** Siguiente paso "natural" según estado y rol: se muestra como botón principal. */
function siguiente(p: Pedido, posibles: Estado[]): Estado | null {
  const orden: Record<Estado, Estado[]> = {
    cargado: ['impreso', 'despachado'],
    impreso: ['despachado'],
    bloqueado: ['cargado', 'impreso', 'despachado'],
    despachado: ['entregado'],
    incidencia: ['despachado', 'entregado'],
    entregado: [],
    cancelado: ['cargado'],
  }
  return orden[p.estado].find((e) => posibles.includes(e)) ?? null
}

export function PedidoDetalle({ idOCodigo }: { idOCodigo: string }) {
  const { yo, expresosPorId, config, version } = useDatos()
  const nombre = useNombre()
  const copiar = useCopiar()
  const avisar = useToast()
  const [det, setDet] = useState<DetallePedido | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [cambio, setCambio] = useState<Estado | null>(null)
  const [editando, setEditando] = useState(false)
  const [msgCliente, setMsgCliente] = useState(false)
  const [haciendo, setHaciendo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDet(await api.obtenerPedido(idOCodigo))
      setError(null)
    } catch (e) {
      setError(mensajeError(e))
    }
  }, [idOCodigo])

  useEffect(() => { void cargar() }, [cargar, version])

  if (det === undefined) return <div className="page"><div className="skeleton" style={{ height: 180 }} /></div>
  if (det === null) {
    return (
      <div className="page narrow">
        <Empty icono={AlertCircle} titulo="No encontré ese pedido">
          {error ?? 'Puede que el link esté mal o que lo hayan borrado.'}
          <a className="btn btn-sm" href="#/pedidos">Ir a pedidos</a>
        </Empty>
      </div>
    )
  }

  const { pedido: p, eventos, archivos } = det
  const expreso = p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined
  const alerta = alertaDe(p, expreso, config)
  const falt = faltantesDe(p, expreso)
  const posibles = transicionesDisponibles(p, yo.rol, yo.id)
  // Retira el cliente: «Lo retiró» reemplaza a «Despachar» y «Marcar entregado».
  const retiro = pasosRetiro(p, expreso, yo.rol, yo.id)
  const prox = retiro.length ? null : siguiente(p, posibles)
  const otras = posibles.filter((a) => a !== prox && !(retiro.length && retiro.includes(a)))
  const tracking = linkSeguimiento(expreso, p.n_guia)
  const info = ESTADO_INFO[p.estado]

  async function directo(a: Estado) {
    setHaciendo(true)
    try {
      await api.cambiarEstado(p.id, a)
      avisar(`Listo: ${ESTADO_INFO[a].corto.toLowerCase()}`)
      await cargar()
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setHaciendo(false)
    }
  }
  const accionar = (a: Estado) => (DIRECTOS.includes(a) ? void directo(a) : setCambio(a))

  async function loRetiro() {
    if (!window.confirm(`¿${p.cliente} ya retiró el pedido? Queda como entregado hoy.`)) return
    setHaciendo(true)
    try {
      await marcarRetirado(api, p, retiro)
      avisar('Listo: lo retiró el cliente')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setHaciendo(false)
      await cargar()
    }
  }

  // Al firmar el remito se puede cerrar el pedido en el mismo paso: «lo retiró» o «entregado hoy».
  const alFirmar = retiro.length
    ? { label: 'Marcar que lo retiró (queda entregado hoy)', hacer: () => marcarRetirado(api, p, retiro), retiro: true }
    : posibles.includes('entregado')
      ? { label: 'Marcar entregado hoy', hacer: () => api.cambiarEstado(p.id, 'entregado', { fecha_entrega: hoyISO() }) }
      : undefined
  const avisarCliente = p.estado === 'despachado' && Boolean(p.n_guia || p.tiene_guia_archivo)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <a href="#/pedidos" className="eyebrow" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={12} /> Pedido #{p.codigo}</a>
          <h1>{p.cliente}</h1>
          <p>Remito <span className="mono">{p.n_remito}</span> · {nombre(p.vendedor_id, p.vendedor_email)} · cargado {fechaHora(p.created_at)}</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => void copiar(linkPedido(p), 'Link copiado')}><Link2 size={16} /> Copiar link</button>
          <button className="btn btn-dark" onClick={() => setMsgCliente(true)}><MessageCircle size={16} /> Responder al cliente</button>
        </div>
      </div>

      <div className="detalle">
        <div className="stack">
          {/* Estado actual */}
          <section className="panel">
            <div className="estado-banner">
              <div className="grande">
                <EstadoChip pedido={p} />
                <PelotaTag pelota={pelotaEn(p)} />
                <span className="muted small">· {hace(p.estado_desde)}</span>
                <Faltantes lista={falt} />
              </div>
              {alerta && <span className="alerta-txt"><AlertCircle size={14} /> {alerta.texto}</span>}
              <DetalleEstado p={p} expresoNombre={expreso?.nombre} tracking={tracking} copiaGuia={guiaSeCopia(expreso)} />
              {posibles.length > 0 && (
                <div className="acciones">
                  {retiro.length > 0 && (
                    <button className="btn btn-primary" disabled={haciendo} onClick={() => void loRetiro()}><HandCoins size={16} /> Lo retiró</button>
                  )}
                  {prox && (
                    <button className="btn btn-primary" disabled={haciendo} onClick={() => accionar(prox)}>
                      {(() => { const I = ICONO_ESTADO[prox]; return <I size={16} /> })()} {accionLabel(p.estado, prox)}
                    </button>
                  )}
                  {otras.map((a) => (
                    <button key={a} className={`btn${a === 'cancelado' ? ' btn-ghost btn-danger' : ''}`} disabled={haciendo} onClick={() => accionar(a)}>
                      {accionLabel(p.estado, a)}
                    </button>
                  ))}
                </div>
              )}
              {!posibles.length && p.estado !== 'entregado' && p.estado !== 'cancelado' && (
                <span className="muted small">{info.descripcion} El próximo paso lo hace {pelotaEn(p) === 'expedicion' ? 'expedición' : pelotaEn(p) === 'expreso' ? 'el expreso' : 'el vendedor'}.</span>
              )}
            </div>
            <Progreso p={p} />
          </section>

          {/* Datos */}
          <section className="panel">
            <div className="panel-head">
              <h2>Datos de envío</h2>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditando(true)}><Pencil size={14} /> Editar</button>
            </div>
            <dl className="datos">
              <Dato label="Expreso">{expreso?.nombre}</Dato>
              <Dato label="Sale desde">{p.deposito_salida ? <DepositoChip deposito={p.deposito_salida} /> : null}</Dato>
              <Dato label="Lead time">{leadTime(p) ? <RelojLead pedido={p} conTexto /> : null}</Dato>
              {(() => {
                const g = partesGuia(p.n_guia)
                if (!g) return <Dato label="N° de guía">{null}</Dato>
                return <>
                  {g.guia && <Dato label="N° de guía"><span className="mono">{g.guia}</span></Dato>}
                  {g.seguimiento && <Dato label="N° de seguimiento"><span className="mono">{g.seguimiento}</span></Dato>}
                </>
              })()}
              <Dato label="Dirección" full>{p.direccion}</Dato>
              <Dato label="Localidad">{[p.localidad, p.provincia].filter(Boolean).join(', ') || null}</Dato>
              <Dato label="CP">{p.cp}</Dato>
              <Dato label="Teléfono">{p.telefono ? <a href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`}>{p.telefono}</a> : null}</Dato>
              <Dato label="Recibe">{p.contacto}</Dato>
              <Dato label="CUIT">{p.cuit}</Dato>
              <Dato label="Fecha del remito">{p.fecha_remito ? fechaCorta(p.fecha_remito) : null}</Dato>
              {p.bultos != null && <Dato label="Bultos">{p.bultos}</Dato>}
              {p.nota && <Dato label="Nota del vendedor" full>{p.nota}</Dato>}
            </dl>
            {p.items.length > 0 && <div style={{ padding: '0 18px 18px' }}><ItemsMini items={p.items} /></div>}
          </section>

          {/* Historial */}
          <Historial pedido={p} eventos={eventos} onComentado={cargar} />
        </div>

        <div className="stack">
          {falt.length > 0 && (
            <div className="faltante-box">
              <Paperclip size={18} />
              <div>
                <b>{falt.map((f) => FALTANTE_LABEL[f]).join(' y ')}</b>
                <div className="small">
                  {falt.includes('guia') ? 'Cargá el número de guía o subí la foto: es lo que pide el cliente. ' : ''}
                  {falt.includes('comprobante') ? 'Subí el remito firmado o el comprobante del expreso.' : ''}
                </div>
              </div>
            </div>
          )}
          {avisarCliente && (
            <div className="faltante-box ok">
              <Send size={18} />
              <div>
                <b>Ya salió: avisale al cliente</b>
                <div className="small">Mensaje armado con la guía{archivos.some((a) => a.tipo === 'guia') ? ' y el archivo para adjuntar' : ''}, por WhatsApp o mail.</div>
                <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => setMsgCliente(true)}><MessageCircle size={14} /> Preparar mensaje</button>
              </div>
            </div>
          )}
          <Archivos pedido={p} archivos={archivos} onCambio={cargar} alFirmar={alFirmar} />
        </div>
      </div>

      {cambio && <CambioEstado pedidos={[p]} a={cambio} onClose={() => setCambio(null)} onHecho={cargar} />}
      {editando && <EditarPedido pedido={p} onClose={() => setEditando(false)} onHecho={cargar} />}
      {msgCliente && <MensajeCliente pedido={p} archivos={archivos} onClose={() => setMsgCliente(false)} />}
    </div>
  )
}

function Dato({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  const vacio = children === null || children === undefined || children === ''
  return (
    <div className="dato" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <dt>{label}</dt>
      <dd className={vacio ? 'vacio' : ''}>{vacio ? 'Sin dato' : children}</dd>
    </div>
  )
}

function DetalleEstado({ p, expresoNombre, tracking, copiaGuia }: { p: Pedido; expresoNombre?: string; tracking: string | null; copiaGuia: boolean }) {
  const copiar = useCopiar()
  const nombre = useNombre()
  const despacho = p.despacho_email || p.despacho_operador
    ? <> · despachó <b>{p.despacho_operador ?? nombre(p.despacho_user_id, p.despacho_email)}</b>{p.despacho_deposito ? <> desde <b>{p.despacho_deposito}</b></> : null}</>
    : null
  if (p.estado === 'bloqueado' && p.bloqueo_motivo) {
    return (
      <div className="small">
        <b>{MOTIVOS_BLOQUEO[p.bloqueo_motivo].label}</b>
        {p.bloqueo_detalle ? ` — ${p.bloqueo_detalle}` : ''}
        {p.stock_estimado ? <> · stock estimado para el <b>{fechaLarga(p.stock_estimado)}</b></> : ''}
      </div>
    )
  }
  if (p.estado === 'incidencia' && p.incidencia_motivo) {
    return <div className="small"><b>{MOTIVOS_INCIDENCIA[p.incidencia_motivo].label}</b>{p.incidencia_detalle ? ` — ${p.incidencia_detalle}` : ''}</div>
  }
  if ((p.estado === 'despachado' || p.estado === 'entregado') && p.fecha_despacho) {
    return (
      <div className="row small">
        <Truck size={15} /> Salió el <b>{fechaLarga(p.fecha_despacho)}</b> por <b>{expresoNombre ?? 'expreso'}</b>
        {p.n_guia && <> · <span className="mono">{guiaLegible(p.n_guia)}</span></>}
        {despacho}
        {p.estado === 'entregado' && p.fecha_entrega && <> · entregado el <b>{fechaLarga(p.fecha_entrega)}</b></>}
        {tracking && (
          <a className="btn btn-sm" href={tracking} target="_blank" rel="noreferrer"
            title={copiaGuia ? 'Copia el N° de guía y abre la página del expreso: pegalo ahí' : undefined}
            onClick={() => { const n = numeroSeguir(p.n_guia); if (copiaGuia && n) void copiar(n, `${n} copiado: pegalo en la página de ${expresoNombre}`) }}>
            <ExternalLink size={14} /> Seguir envío en {expresoNombre}{copiaGuia && p.n_guia ? ' (copia la guía)' : ''}
          </a>
        )}
      </div>
    )
  }
  if (p.estado === 'cargado') return <div className="small muted">{ESTADO_INFO.cargado.descripcion}</div>
  if (p.estado === 'impreso') return <div className="small muted">Impreso el {fechaHora(p.impreso_at)}. {ESTADO_INFO.impreso.descripcion.split('. ')[1] ?? ''}</div>
  return null
}

function Progreso({ p }: { p: Pedido }) {
  const pasos: { clave: string; label: string; fecha: string | null; hecho: boolean }[] = [
    { clave: 'cargado', label: 'Cargado', fecha: fechaCorta(p.created_at), hecho: true },
    { clave: 'impreso', label: 'Impreso', fecha: p.impreso_at ? fechaCorta(p.impreso_at) : null, hecho: Boolean(p.impreso_at) },
    { clave: 'despachado', label: 'Despachado', fecha: p.fecha_despacho ? fechaCorta(p.fecha_despacho) : null, hecho: Boolean(p.fecha_despacho) && p.estado !== 'cancelado' },
    { clave: 'entregado', label: 'Entregado', fecha: p.fecha_entrega ? fechaCorta(p.fecha_entrega) : null, hecho: p.estado === 'entregado' },
  ]
  const actual = pasos.findIndex((x) => !x.hecho)
  return (
    <div className="progreso" aria-label="Avance del pedido">
      {pasos.map((x, i) => (
        <div key={x.clave} className={`paso${x.hecho ? ' hecho' : ''}${i === actual && p.estado !== 'cancelado' ? ' actual' : ''}`}>
          <div className="barra" />
          <span>{x.label}<br /><small>{x.fecha ?? (i === actual && p.estado === 'bloqueado' ? 'frenado' : '—')}</small></span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Historial y comentarios
const CAMPO_LABEL: Record<string, string> = {
  n_remito: 'N° de remito', fecha_remito: 'fecha del remito', cliente: 'cliente', cuit: 'CUIT', direccion: 'dirección', localidad: 'localidad',
  provincia: 'provincia', cp: 'CP', telefono: 'teléfono', contacto: 'quién recibe', nota: 'nota', expreso_id: 'expreso', n_guia: 'N° de guía',
  bultos: 'bultos', fecha_despacho: 'fecha de despacho', fecha_entrega: 'fecha de entrega', stock_estimado: 'fecha estimada de stock',
  deposito_salida: 'depósito de salida',
}

function Historial({ pedido, eventos, onComentado }: { pedido: Pedido; eventos: Evento[]; onComentado: () => Promise<void> }) {
  const nombre = useNombre()
  const { expresosPorId } = useDatos()
  const avisar = useToast()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function comentar() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await api.comentar(pedido.id, texto)
      setTexto('')
      await onComentado()
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setEnviando(false)
    }
  }

  const valor = (campo: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return '—'
    if (campo === 'expreso_id') return expresosPorId.get(String(v))?.nombre ?? '—'
    if (/fecha|stock_estimado/.test(campo)) return fechaCorta(String(v))
    return String(v)
  }

  function describir(e: Evento): ReactNode {
    const quien = <><b>{nombre(e.user_id, e.user_email, e.operador)}</b>{e.deposito ? <span className="muted"> en {e.deposito}</span> : null}</>
    const d = (e.datos ?? {}) as Record<string, unknown>
    switch (e.tipo) {
      case 'alta':
        return <>{quien} cargó el remito</>
      case 'estado': {
        const a = e.a_estado as Estado
        const extra: string[] = []
        if (a === 'bloqueado' && d.bloqueo_motivo) extra.push(MOTIVOS_BLOQUEO[d.bloqueo_motivo as keyof typeof MOTIVOS_BLOQUEO]?.label ?? '')
        if (d.stock_estimado) extra.push(`stock para el ${fechaCorta(String(d.stock_estimado))}`)
        if (a === 'despachado' && d.fecha_despacho) extra.push(`salió el ${fechaCorta(String(d.fecha_despacho))}`)
        if (d.n_guia) extra.push(`guía ${String(d.n_guia)}`)
        if (a === 'entregado' && d.fecha_entrega) extra.push(`el ${fechaCorta(String(d.fecha_entrega))}`)
        if (a === 'incidencia' && d.incidencia_motivo) extra.push(MOTIVOS_INCIDENCIA[d.incidencia_motivo as keyof typeof MOTIVOS_INCIDENCIA]?.label ?? '')
        const verbo = a === 'cargado' && e.de_estado === 'impreso' ? 'deshizo "impreso"' : `pasó a ${ESTADO_INFO[a].label.toLowerCase()}`
        return <>{quien} {verbo}{extra.filter(Boolean).length ? ` · ${extra.filter(Boolean).join(' · ')}` : ''}</>
      }
      case 'archivo':
        return <>{quien} {d.accion === 'borro' ? 'borró' : 'subió'} {TIPO_ARCHIVO_LABEL[d.tipo as TipoArchivo]?.toLowerCase() ?? 'un archivo'} <span className="muted">({String(d.nombre ?? '')})</span></>
      case 'edicion': {
        const campos = Object.entries(d)
        return (
          <>
            {quien} corrigió {campos.map(([k]) => CAMPO_LABEL[k] ?? k).join(', ')}
            <div className="t-meta">
              {campos.map(([k, v]) => {
                const cambio = v as { antes: unknown; despues: unknown }
                return <div key={k}>{CAMPO_LABEL[k] ?? k}: {valor(k, cambio.antes)} → {valor(k, cambio.despues)}</div>
              })}
            </div>
          </>
        )
      }
      case 'comentario':
        return <>{quien} comentó</>
    }
  }

  const icono = (e: Evento) => {
    if (e.tipo === 'estado' && e.a_estado) { const I = ICONO_ESTADO[e.a_estado]; return <I size={12} /> }
    if (e.tipo === 'comentario') return <MessageSquare size={12} />
    if (e.tipo === 'archivo') return <Paperclip size={12} />
    if (e.tipo === 'edicion') return <Pencil size={12} />
    return <PlusCircle size={12} />
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Historial y comentarios</h2><span className="muted small">{eventos.length} movimientos</span></div>
      <ol className="timeline">
        {eventos.map((e) => (
          <li key={e.id}>
            <span className={`dot ${e.tipo}`}>{icono(e)}</span>
            <div>
              <div className="t-head">{describir(e)}</div>
              <div className="t-meta">{fechaHora(e.created_at)} · {hace(e.created_at)}</div>
              {e.nota && <div className="t-nota">{e.nota}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="comentar">
        <textarea
          className="control"
          placeholder="Escribí una consulta o novedad (reemplaza el ida y vuelta del grupo)…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void comentar() }}
        />
        <button className="btn btn-dark" onClick={() => void comentar()} disabled={enviando || !texto.trim()} aria-label="Enviar comentario"><Send size={16} /></button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Archivos
function Archivos({ pedido, archivos, onCambio, alFirmar }: { pedido: Pedido; archivos: Archivo[]; onCambio: () => Promise<void>; alFirmar?: { label: string; hacer: () => Promise<void>; retiro?: boolean } }) {
  const [firmando, setFirmando] = useState(false)
  const { yo } = useDatos()
  const avisar = useToast()
  const nombre = useNombre()
  const [subiendo, setSubiendo] = useState<TipoArchivo | null>(null)
  const leerGuia = useLeerGuia(onCambio)

  async function subir(tipo: TipoArchivo, file: File | undefined) {
    if (!file) return
    setSubiendo(tipo)
    try {
      await api.subirArchivo(pedido.id, tipo, file)
      avisar(`${TIPO_ARCHIVO_LABEL[tipo]} subido`)
      setCamaraMarca(null)
      await onCambio()
      if (tipo === 'guia') leerGuia.revisar(pedido, file)
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setSubiendo(null)
    }
  }

  async function abrir(a: Archivo) {
    const ventana = window.open('', '_blank')
    try {
      const url = await api.urlArchivo(a)
      if (ventana) ventana.location.href = url
      else window.location.href = url
    } catch (e) {
      ventana?.close()
      avisar(mensajeError(e), true)
    }
  }

  async function borrar(a: Archivo) {
    if (!window.confirm(`¿Borrar "${a.nombre}"?`)) return
    try {
      await api.borrarArchivo(a)
      await onCambio()
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  // Si la página se recargó mientras estaba abierta la cámara (Android la saca de memoria), avisar qué pasó.
  // 26/11: no avisar si ese archivo igual llegó (la marca puede quedar de un intento anterior o de elegir «Archivos» y cancelar).
  const [camaraMarca, setCamaraMarca] = useState(() => {
    const pend = camaraPendiente()
    if (pend && pend.codigo === pedido.codigo) { limpiarCamara(); return pend }
    return null
  })
  const camaraPerdida = !!camaraMarca && subiendo === null &&
    !archivos.some((a) => a.tipo === camaraMarca.tipo && Date.parse(a.created_at) >= camaraMarca.at - 60000)

  // 26/11 (Felipe: «al tocar Guía o Remito firmado, que en el celular dé la opción de Archivos o Cámara; en la compu, adjuntar»):
  // UN botón por tipo, sin capture: en Android/iPhone el selector del sistema ya ofrece Cámara y Archivos; en la compu adjunta.
  // OJO: es una función que devuelve JSX, NO un componente (<Subir/>) definido adentro del render: como la pantalla se refresca
  // sola cada pocos segundos, un componente interno se desmontaba con el selector de archivos abierto y la foto/PDF elegido se perdía.
  const celular = esCelular()
  const subirBoton = (tipo: TipoArchivo, label: string) => (
    <label key={tipo} className="btn btn-sm" aria-disabled={subiendo !== null} title={celular ? 'Sacar una foto o elegir un archivo' : 'Adjuntar un PDF o una foto'} {...soltable((fs) => { if (subiendo === null) void subir(tipo, fs[0]) })}>
      <Paperclip size={14} /> {subiendo === tipo ? 'Subiendo…' : label}
      <input type="file" hidden accept={tipo === 'otro' ? undefined : ACEPTA_ARCHIVOS} disabled={subiendo !== null}
        onClick={() => { if (celular && tipo !== 'otro') marcarCamara(pedido.codigo, tipo) }}
        onChange={(e) => { limpiarCamara(); void subir(tipo, e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )

  return (
    <section className="panel">
      <div className="panel-head"><h2>Archivos</h2><span className="muted small">{archivos.length}</span></div>
      <div className="archivos">
        {camaraPerdida && <div className="aviso warn" role="alert">El celular cerró la página mientras estaba abierta la cámara y la foto no llegó. Probá de nuevo: tocá el botón y elegí Cámara o la foto de la galería. <button className="btn btn-ghost btn-sm" onClick={() => setCamaraMarca(null)}>Entendido</button></div>}
        {archivos.length === 0 && <span className="muted small">Todavía no hay archivos.</span>}
        {archivos.map((a) => (
          <div key={a.id} className="archivo">
            <span className="a-ico">{a.mime?.startsWith('image/') ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
            <button className="a-info btn-ghost" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => void abrir(a)}>
              <b>{TIPO_ARCHIVO_LABEL[a.tipo]}</b>
              <span>{a.nombre} · {nombre(a.subido_por, a.subido_email, a.operador)} · {fechaCorta(a.created_at)}</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void abrir(a)} aria-label="Abrir"><ExternalLink size={15} /></button>
            {(a.subido_por === yo.id || yo.rol === 'admin') && (
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => void borrar(a)} aria-label="Borrar"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        {pedido.estado !== 'cancelado' && (
          <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => setFirmando(true)}>
            <PenLine size={14} /> Firmar el remito en el celular
          </button>
        )}
        <div className="label" style={{ marginTop: 6 }}>Agregar</div>
        <div className="subir-grid">
          {subirBoton('guia', 'Guía')}
          {subirBoton('remito_firmado', 'Remito firmado')}
          {!archivos.some((a) => a.tipo === 'remito') && subirBoton('remito', 'Remito (PDF)')}
          {!CON_SUBIR && subirBoton('foto', 'Foto')}
          {!CON_SUBIR && subirBoton('otro', 'Otro archivo')} {/* PARCHE CONTEO: el CRM recibe guía, remito y remito firmado */}
        </div>
      </div>
      {leerGuia.elemento}
      {firmando && <FirmaRemito pedido={pedido} alFirmar={alFirmar} onClose={() => setFirmando(false)} onHecho={onCambio} />}
    </section>
  )
}

// ---------------------------------------------------------------- Editar datos
function EditarPedido({ pedido, onClose, onHecho }: { pedido: Pedido; onClose: () => void; onHecho: () => Promise<void> }) {
  const { expresos } = useDatos()
  const avisar = useToast()
  const [c, setC] = useState<CamposEditables>({
    cliente: pedido.cliente, n_remito: pedido.n_remito, direccion: pedido.direccion, localidad: pedido.localidad, provincia: pedido.provincia,
    cp: pedido.cp, telefono: pedido.telefono, contacto: pedido.contacto, expreso_id: pedido.expreso_id, n_guia: pedido.n_guia, bultos: pedido.bultos,
    nota: pedido.nota, fecha_despacho: pedido.fecha_despacho, fecha_entrega: pedido.fecha_entrega, deposito_salida: pedido.deposito_salida ?? null,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof CamposEditables>(k: K, v: CamposEditables[K]) => setC((x) => ({ ...x, [k]: v }))
  const txt = (k: keyof CamposEditables) => ({ value: (c[k] ?? '') as string, onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never) })

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const cambios = Object.fromEntries(Object.entries(c).filter(([k, v]) => ((pedido as unknown as Record<string, unknown>)[k] ?? null) !== (v ?? null))) as CamposEditables
      if (Object.keys(cambios).length) await api.editarPedido(pedido.id, cambios)
      avisar('Datos guardados')
      await onHecho()
      onClose()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Editar datos" subtitulo="Cada cambio queda en el historial con el valor anterior." onClose={onClose}
      pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="grid-2">
        <label className="field"><span>Cliente</span><input className="control" {...txt('cliente')} /></label>
        <label className="field"><span>N° de remito</span><input className="control mono" {...txt('n_remito')} /></label>
      </div>
      <label className="field"><span>Dirección</span><input className="control" {...txt('direccion')} /></label>
      <div className="grid-3">
        <label className="field"><span>Localidad</span><input className="control" {...txt('localidad')} /></label>
        <label className="field"><span>Provincia</span><input className="control" {...txt('provincia')} /></label>
        <label className="field"><span>CP</span><input className="control" {...txt('cp')} /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Teléfono</span><input className="control" type="tel" {...txt('telefono')} /></label>
        <label className="field"><span>Recibe</span><input className="control" {...txt('contacto')} /></label>
      </div>
      <div className="grid-3">
        <label className="field"><span>Expreso</span>
          <select className="control" value={c.expreso_id ?? ''} onChange={(e) => set('expreso_id', e.target.value || null)}>
            <option value="">—</option>
            {expresos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <CamposGuia valor={c.n_guia} onChange={(v) => set('n_guia', v || null)} />
        <label className="field"><span>Bultos</span><input className="control" type="number" min={0} value={c.bultos ?? ''} onChange={(e) => set('bultos', e.target.value === '' ? null : Number(e.target.value))} /></label>
      </div>
      <DepositoSalida valor={c.deposito_salida ?? null} onChange={(v) => set('deposito_salida', v)} />
      {(pedido.fecha_despacho || pedido.fecha_entrega) && (
        <div className="grid-2">
          {pedido.fecha_despacho && <label className="field"><span>Fecha de despacho</span><input className="control" type="date" {...txt('fecha_despacho')} /></label>}
          {pedido.fecha_entrega && <label className="field"><span>Fecha de entrega</span><input className="control" type="date" {...txt('fecha_entrega')} /></label>}
        </div>
      )}
      <label className="field"><span>Nota</span><textarea className="control" {...txt('nota')} /></label>
      {error && <div className="aviso err">{error}</div>}
    </Modal>
  )
}

// ---------------------------------------------------------------- Mensaje al cliente
function MensajeCliente({ pedido, archivos, onClose }: { pedido: Pedido; archivos: Archivo[]; onClose: () => void }) {
  const { expresosPorId } = useDatos()
  const copiar = useCopiar()
  const avisar = useToast()
  const [texto, setTexto] = useState(() => mensajeCliente(pedido, pedido.expreso_id ? expresosPorId.get(pedido.expreso_id) : undefined))
  const [compartiendo, setCompartiendo] = useState(false)
  const guia = [...archivos].reverse().find((a) => a.tipo === 'guia')
  const asunto = asuntoCliente(pedido)
  // En el celular, «Compartir» abre WhatsApp, Gmail, etc. con la guía ya adjunta. En la compu se descarga y se adjunta a mano.
  async function compartirGuia() {
    if (!guia) return
    setCompartiendo(true)
    try {
      const url = await api.urlArchivo(guia)
      const blob = await (await fetch(url)).blob()
      const archivo = new File([blob], guia.nombre, { type: guia.mime || blob.type })
      const datos = { files: [archivo], title: asunto, text: textoPlano(texto) }
      if (navigator.canShare?.(datos)) {
        await navigator.share(datos)
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(archivo)
        a.download = guia.nombre
        a.click()
        avisar('Guía descargada: adjuntala en WhatsApp o en el mail')
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') avisar(mensajeError(e), true)
    } finally {
      setCompartiendo(false)
    }
  }
  return (
    <Modal titulo="Responder al cliente" subtitulo="Texto armado con el estado real del pedido. Podés editarlo antes de mandarlo." onClose={onClose}
      pie={(
        <>
          <button className="btn" onClick={() => void copiar(texto, 'Mensaje copiado')}><Copy size={16} /> Copiar</button>
          <a className="btn" href={linkMail(null, asunto, texto)}><Mail size={16} /> Mail</a>
          {guia && <button className="btn" disabled={compartiendo} onClick={() => void compartirGuia()}><Share2 size={16} /> {compartiendo ? 'Preparando…' : 'Compartir con la guía'}</button>}
          <a className="btn btn-primary" href={linkWhatsApp(pedido.telefono, texto)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {pedido.telefono ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}</a>
        </>
      )}>
      <textarea className="control" style={{ minHeight: 150 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {guia && <div className="aviso info"><Share2 size={16} /> «Compartir con la guía» manda el texto con el archivo de la guía adjunto (en el celular elegís WhatsApp o mail).</div>}
      {!pedido.telefono && <div className="aviso info">El pedido no tiene teléfono cargado: WhatsApp se abre para que elijas el chat.</div>}
      {pedido.estado === 'cargado' && <div className="aviso warn"><Printer size={16} /> Ojo: todavía no está impreso. Si el cliente apura, comentalo en el pedido para que expedición lo vea.</div>}
    </Modal>
  )
}
