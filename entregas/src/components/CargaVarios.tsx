// Carga de varios remitos juntos: se leen todos los PDFs, se revisa cada uno (expreso, cliente, N°),
// se cargan de una y queda un solo mensaje para el grupo de WhatsApp con todos los links.
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronUp, Copy, FileText, Loader2, MessageCircle, Plus, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { leerRemito, PEDIDO_VACIO, type Aviso } from '../lib/leerRemito'
import { mensajeGrupoVarios } from '../lib/mensajes'
import { depositoActual } from '../lib/operador'
import { normalizarNumeroRemito } from '../lib/remitoParser'
import type { NuevoPedido, Pedido } from '../lib/types'
import { DepositoSalida } from './DepositoSalida'
import { columnasPick, ItemsMini } from './NuevoRemito'
import { EstadoChip, useCopiar } from './ui'

interface Item {
  key: string
  archivo: File
  leyendo: boolean
  form: NuevoPedido
  aviso: Aviso | null
  duplicado: Pedido | null
  abierto: boolean
  guardando: boolean
  error: string | null
  creado: Pedido | null
  /** Es una guía del expreso, no un remito: no se carga. */
  esGuia: boolean
}

let seq = 0
const nuevoItem = (archivo: File): Item => ({
  key: `r${++seq}`, archivo, leyendo: true, form: { ...PEDIDO_VACIO, deposito_salida: depositoActual() }, aviso: null, duplicado: null, abierto: false, guardando: false, error: null, creado: null, esGuia: false,
})

export function CargaVarios({ archivos, onSalir }: { archivos: File[]; onSalir: () => void }) {
  const { yo, expresos, usuarios, expresosPorId, recargar } = useDatos()
  const copiar = useCopiar()
  const activos = expresos.filter((e) => e.activo)
  const [items, setItems] = useState<Item[]>(() => archivos.map(nuevoItem))
  // Expedición carga a nombre de un vendedor: hay que elegirlo (no queda a nombre de la cuenta de expedición).
  const [vendedorId, setVendedorId] = useState(() => (yo.rol === 'expedicion' ? '' : yo.id))
  const [guardando, setGuardando] = useState(false)
  const [terminado, setTerminado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const puedeElegirVendedor = yo.rol !== 'vendedor'
  const vendedores = usuarios.filter((u) => u.rol !== 'expedicion')

  const actualizar = (key: string, cambio: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...(typeof cambio === 'function' ? cambio(it) : cambio) } : it)))
  const setCampo = <K extends keyof NuevoPedido>(key: string, k: K, v: NuevoPedido[K]) => actualizar(key, (it) => ({ form: { ...it.form, [k]: v } }))

  // Lee los archivos de a uno (los nuevos que se van agregando también).
  const leidos = useRef(new Set<string>())
  useEffect(() => {
    const pendientes = items.filter((it) => it.leyendo && !leidos.current.has(it.key))
    if (!pendientes.length) return
    pendientes.forEach((it) => leidos.current.add(it.key))
    void (async () => {
      for (const it of pendientes) {
        const { datos, aviso, esGuia } = await leerRemito(it.archivo, activos)
        if (esGuia) { actualizar(it.key, { leyendo: false, aviso, esGuia: true, abierto: true }); continue }
        const form = { ...PEDIDO_VACIO, ...datos, n_remito: datos.n_remito ? normalizarNumeroRemito(datos.n_remito) : '' }
        let duplicado: Pedido | null = null
        if (form.n_remito || form.remito_hash) duplicado = await api.buscarDuplicado(form.n_remito || '-', form.remito_hash).catch(() => null)
        actualizar(it.key, (cur) => ({ leyendo: false, form: { ...form, deposito_salida: cur.form.deposito_salida ?? null }, aviso, duplicado, abierto: aviso.tipo !== 'ok' }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // Repetidos dentro del mismo lote (mismo número o mismo archivo).
  const repetidos = useMemo(() => {
    const vistos = new Map<string, string>()
    const rep = new Set<string>()
    for (const it of items) {
      for (const clave of [it.form.n_remito && `n:${normalizarNumeroRemito(it.form.n_remito)}`, it.form.remito_hash && `h:${it.form.remito_hash}`]) {
        if (!clave) continue
        if (vistos.has(clave)) rep.add(it.key)
        else vistos.set(clave, it.key)
      }
    }
    return rep
  }, [items])

  const problema = (it: Item): string | null => {
    if (it.creado) return null
    if (it.leyendo) return 'Leyendo…'
    if (it.esGuia) return 'Es una guía del expreso, no un remito: sacala de la tanda y subila en Expedición → «Subir guías»'
    if (!it.form.n_remito.trim()) return 'Falta el N° de remito'
    if (!it.form.cliente.trim()) return 'Falta el cliente'
    if (!it.form.expreso_id) return 'Elegí por dónde va'
    if (it.duplicado) return `Ya está cargado (pedido #${it.duplicado.codigo})`
    if (repetidos.has(it.key)) return 'Está repetido en esta tanda'
    return null
  }
  const pendientes = items.filter((it) => !it.creado)
  const conProblema = pendientes.filter((it) => problema(it))
  const leyendo = items.some((it) => it.leyendo)

  function agregar(files: FileList | null) {
    const nuevos = Array.from(files ?? []).map(nuevoItem)
    if (nuevos.length) setItems((xs) => [...xs, ...nuevos])
  }

  function todosPor(expresoId: string) {
    setItems((xs) => xs.map((it) => (it.creado ? it : { ...it, form: { ...it.form, expreso_id: expresoId } })))
  }

  function todosDesde(deposito: string | null) {
    setItems((xs) => xs.map((it) => (it.creado ? it : { ...it, form: { ...it.form, deposito_salida: deposito } })))
  }
  const depositoComun = pendientes.length > 0 && pendientes.every((it) => (it.form.deposito_salida ?? null) === (pendientes[0].form.deposito_salida ?? null))
    ? pendientes[0].form.deposito_salida ?? null : null

  async function cargarTodos() {
    setGuardando(true)
    for (const it of items) {
      if (it.creado || problema(it)) continue
      actualizar(it.key, { guardando: true, error: null })
      try {
        const p = await api.crearPedido({ ...it.form, n_remito: normalizarNumeroRemito(it.form.n_remito), cliente: it.form.cliente.trim() }, it.archivo, vendedorId)
        actualizar(it.key, { guardando: false, creado: p })
      } catch (e) {
        actualizar(it.key, { guardando: false, error: mensajeError(e), abierto: true })
      }
    }
    setGuardando(false)
    setTerminado(true)
    void recargar()
  }

  const creados = items.filter((it) => it.creado).map((it) => it.creado!)
  const vendedor = usuarios.find((u) => u.id === vendedorId)?.nombre ?? yo.nombre

  if (terminado && creados.length && !pendientes.length) {
    const msg = mensajeGrupoVarios(creados, expresosPorId, vendedor)
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <div className="eyebrow">Remitos cargados</div>
            <h1>Listo: {creados.length} remitos en la cola de expedición</h1>
            <p>Expedición los ve ahora en "Expedición hoy".</p>
          </div>
        </div>
        <div className="panel panel-pad stack">
          <div className="lista-lote">
            {creados.map((p) => (
              <a key={p.id} className="row" href={`#/p/${p.codigo}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <EstadoChip pedido={p} corto /> <b>{p.cliente}</b> <span className="mono muted small">{p.n_remito}</span>
                <span className="spacer" /><span className="small muted">{p.expreso_id ? expresosPorId.get(p.expreso_id)?.nombre : ''}</span>
              </a>
            ))}
          </div>
          <div className="field">
            <span>Un solo mensaje para el grupo de WhatsApp</span>
            <div className="mensaje-preview">{msg}</div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void copiar(msg, 'Mensaje copiado: pegalo en el grupo')}><Copy size={16} /> Copiar mensaje</button>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Abrir WhatsApp</a>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={onSalir}><Plus size={16} /> Cargar más</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <button className="eyebrow link-plain" onClick={onSalir}><ArrowLeft size={12} /> Cargar remito</button>
          <h1>Cargar {items.length} remitos</h1>
          <p>Revisá cada uno y elegí por dónde va. Se cargan todos juntos y queda un solo mensaje para el grupo.</p>
        </div>
      </div>

      <div className="stack">
        <div className="panel panel-pad stack">
          <div className="field">
            <span>¿Van todos por el mismo lado? <span className="hint">(después podés cambiar uno)</span></span>
            <div className="expresos-pick" style={columnasPick(activos.length)}>
              {activos.map((e) => (
                <button key={e.id} type="button" className="expreso-opt" aria-pressed={pendientes.length > 0 && pendientes.every((it) => it.form.expreso_id === e.id)} onClick={() => todosPor(e.id)}>
                  <b>{e.nombre}</b>
                  <span>Todos por acá</span>
                </button>
              ))}
            </div>
          </div>
          <DepositoSalida titulo="¿Salen todos del mismo depósito?" valor={depositoComun} onChange={todosDesde} />
          {puedeElegirVendedor && (
            <label className="field">
              <span>Vendedor de todos</span>
              <select className="control" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                {!vendedorId && <option value="">Elegí el vendedor…</option>}
                {vendedores.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </label>
          )}
        </div>

        {items.map((it, i) => {
          const prob = problema(it)
          const e = it.form.expreso_id ? expresosPorId.get(it.form.expreso_id) : undefined
          return (
            <div key={it.key} className={`panel lote-item${it.creado ? ' ok' : prob && !it.leyendo ? ' mal' : ''}`}>
              <div className="lote-head">
                <span className="lote-n">{i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {it.leyendo ? (
                    <span className="row small muted"><Loader2 size={14} className="gira" /> Leyendo {it.archivo.name}…</span>
                  ) : (
                    <>
                      <b className="lote-cli">{it.form.cliente || <span className="muted">Sin cliente</span>}</b>
                      <span className="small muted"><span className="mono">{it.form.n_remito || 'sin N°'}</span> · {[it.form.localidad, it.form.provincia].filter(Boolean).join(', ') || 'sin localidad'} · {e?.nombre ?? 'sin expreso'}{it.form.deposito_salida ? ` · sale de ${it.form.deposito_salida}` : ''}</span>
                    </>
                  )}
                </div>
                {it.creado
                  ? <span className="chip tono-ok"><Check size={13} /> Cargado #{it.creado.codigo}</span>
                  : it.guardando ? <Loader2 size={16} className="gira" />
                    : <>
                      <button className="btn btn-ghost btn-sm" onClick={() => actualizar(it.key, { abierto: !it.abierto })} aria-expanded={it.abierto}>
                        {it.abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />} <span className="desktop-only">Editar</span>
                      </button>
                      <button className="btn btn-ghost btn-sm" aria-label="Quitar de la tanda" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}><X size={15} /></button>
                    </>}
              </div>

              {!it.creado && !it.leyendo && (
                <div className="lote-body">
                  <div className="expresos-pick compacto" style={columnasPick(activos.length)}>
                    {activos.map((x) => (
                      <button key={x.id} type="button" className="expreso-opt" aria-pressed={it.form.expreso_id === x.id} onClick={() => setCampo(it.key, 'expreso_id', x.id)}>
                        <b>{x.nombre}</b>
                      </button>
                    ))}
                  </div>
                  {(prob || it.error) && (
                    <div className="aviso err"><AlertTriangle size={15} />
                      <span>{it.error ?? prob}{it.duplicado ? <> · <a href={`#/p/${it.duplicado.codigo}`} target="_blank" rel="noreferrer">verlo</a></> : null}</span>
                    </div>
                  )}
                  {!prob && !it.error && it.aviso && it.aviso.tipo !== 'ok' && <div className={`aviso ${it.aviso.tipo}`}><AlertTriangle size={15} /> {it.aviso.texto}</div>}
                  {it.abierto && (
                    <div className="stack" style={{ gap: 10 }}>
                      <DepositoSalida compacto valor={it.form.deposito_salida ?? null} onChange={(v) => setCampo(it.key, 'deposito_salida', v)} />
                      <div className="grid-3">
                        <label className="field"><span>N° de remito</span>
                          <input className="control mono" value={it.form.n_remito} onChange={(ev) => setCampo(it.key, 'n_remito', ev.target.value)}
                            onBlur={(ev) => { const n = ev.target.value && normalizarNumeroRemito(ev.target.value); if (n) { setCampo(it.key, 'n_remito', n); void api.buscarDuplicado(n, it.form.remito_hash).then((d) => actualizar(it.key, { duplicado: d })).catch(() => {}) } }} />
                        </label>
                        <label className="field span-2"><span>Cliente</span><input className="control" value={it.form.cliente} onChange={(ev) => setCampo(it.key, 'cliente', ev.target.value)} /></label>
                      </div>
                      <label className="field"><span>Dirección de entrega</span><input className="control" value={it.form.direccion ?? ''} onChange={(ev) => setCampo(it.key, 'direccion', ev.target.value || null)} /></label>
                      <div className="grid-3">
                        <label className="field"><span>Localidad</span><input className="control" value={it.form.localidad ?? ''} onChange={(ev) => setCampo(it.key, 'localidad', ev.target.value || null)} /></label>
                        <label className="field"><span>Provincia</span><input className="control" value={it.form.provincia ?? ''} onChange={(ev) => setCampo(it.key, 'provincia', ev.target.value || null)} /></label>
                        <label className="field"><span>Teléfono</span><input className="control" type="tel" value={it.form.telefono ?? ''} onChange={(ev) => setCampo(it.key, 'telefono', ev.target.value || null)} /></label>
                      </div>
                      <label className="field"><span>Nota para expedición <span className="hint">(opcional)</span></span>
                        <input className="control" value={it.form.nota ?? ''} onChange={(ev) => setCampo(it.key, 'nota', ev.target.value || null)} />
                      </label>
                      {it.form.items.length > 0 && <ItemsMini items={it.form.items} />}
                      <span className="small muted"><FileText size={12} /> {it.archivo.name}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <label className="btn" style={{ justifySelf: 'start' }}>
          <Upload size={16} /> Sumar más PDFs
          <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(ev) => { agregar(ev.target.files); ev.target.value = '' }} />
        </label>

        <div className="row lote-pie">
          <button className="btn" onClick={onSalir} disabled={guardando}>Cancelar</button>
          <span className="spacer" />
          {!leyendo && conProblema.length > 0 && <span className="small" style={{ color: 'var(--brand-red)' }}>{conProblema.length} con datos por revisar</span>}
          {!leyendo && !conProblema.length && !vendedorId && <span className="small" style={{ color: 'var(--brand-red)' }}>Elegí el vendedor</span>}
          <button className="btn btn-primary" onClick={() => void cargarTodos()} disabled={guardando || leyendo || pendientes.length === 0 || conProblema.length > 0 || !vendedorId}>
            {guardando ? 'Cargando…' : leyendo ? 'Leyendo…' : `Cargar ${pendientes.length} remito${pendientes.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
