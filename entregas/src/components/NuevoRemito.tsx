// Alta de un remito: el vendedor arrastra el PDF de Contabilium, la app completa los datos, se elige
// el expreso y listo. Al guardar, queda el mensaje armado para el grupo de WhatsApp con el link al pedido.
import { AlertTriangle, ArrowRight, Check, Copy, FileText, MessageCircle, Plus, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { CRITERIO_LABEL, emparejarGuia, type Emparejamiento } from '../lib/emparejarGuia'
import { leerRemito, PEDIDO_VACIO, type Aviso } from '../lib/leerRemito'
import { mensajeGrupo } from '../lib/mensajes'
import { depositoActual } from '../lib/operador'
import { normalizarNumeroRemito } from '../lib/remitoParser'
import { ir } from '../lib/ruta'
import type { ItemRemito, NuevoPedido, Pedido } from '../lib/types'
import { CargaVarios } from './CargaVarios'
import { DepositoSalida } from './DepositoSalida'
import { SubirGuias } from './SubirGuias'
import { EstadoChip, useCopiar } from './ui'

const VACIO = PEDIDO_VACIO
/** Formulario vacío: «¿Desde dónde sale?» arranca con el depósito de este dispositivo (si tiene). */
const vacio = (): NuevoPedido => ({ ...VACIO, deposito_salida: depositoActual() })

export function NuevoRemito() {
  const { yo, expresos, usuarios, expresosPorId, pedidos, recargar } = useDatos()
  const copiar = useCopiar()
  // Si el archivo resultó ser una guía del expreso: a qué pedido corresponde (si se encontró).
  const [guia, setGuia] = useState<{ emp: Emparejamiento | null } | null>(null)
  const [subirComoGuia, setSubirComoGuia] = useState<File | null>(null)
  const [form, setForm] = useState<NuevoPedido>(vacio)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [lote, setLote] = useState<File[] | null>(null)
  const [duplicado, setDuplicado] = useState<Pedido | null>(null)
  // Expedición carga a nombre de un vendedor: hay que elegirlo (no queda a nombre de la cuenta de expedición).
  const [vendedorId, setVendedorId] = useState(() => (yo.rol === 'expedicion' ? '' : yo.id))
  const [encima, setEncima] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState<Pedido | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof NuevoPedido>(k: K, v: NuevoPedido[K]) => setForm((f) => ({ ...f, [k]: v }))
  const activos = expresos.filter((e) => e.activo)
  const puedeElegirVendedor = yo.rol !== 'vendedor'
  const vendedores = usuarios.filter((u) => u.rol !== 'expedicion')

  // Duplicado por número (cuando se escribe a mano o se corrige).
  useEffect(() => {
    const n = form.n_remito.trim()
    if (n.length < 6) { setDuplicado(null); return }
    const t = setTimeout(() => {
      void api.buscarDuplicado(normalizarNumeroRemito(n), form.remito_hash).then(setDuplicado).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [form.n_remito, form.remito_hash])

  async function procesar(f: File) {
    setError(null)
    setAviso(null)
    setGuia(null)
    setArchivo(f)
    setLeyendo(true)
    try {
      const { datos, aviso: av, esGuia, texto } = await leerRemito(f, activos)
      if (esGuia) {
        setGuia({ emp: emparejarGuia(texto ?? '', pedidos.filter((p) => p.estado !== 'cancelado')) })
        setAviso(av)
        return
      }
      setForm((prev) => ({ ...prev, ...datos }))
      setAviso(av)
    } finally {
      setLeyendo(false)
    }
  }

  // Un archivo: alta normal. Varios: carga en lote.
  function recibir(files: FileList | null | undefined) {
    const lista = Array.from(files ?? [])
    if (lista.length > 1) setLote(lista)
    else if (lista[0]) void procesar(lista[0])
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setEncima(false)
    recibir(e.dataTransfer.files)
  }

  async function guardar() {
    setError(null)
    const n = normalizarNumeroRemito(form.n_remito)
    if (guia) { setError('Ese archivo es una guía del expreso, no un remito. Subila como guía o elegí el remito.'); return }
    if (!n) { setError('Falta el número de remito.'); return }
    if (!form.cliente.trim()) { setError('Falta el cliente.'); return }
    if (!form.expreso_id) { setError('Elegí por dónde va.'); return }
    if (!vendedorId) { setError('Elegí de qué vendedor es el remito.'); return }
    if (duplicado) { setError('Ese remito ya está cargado. Abrilo desde el aviso de arriba.'); return }
    setGuardando(true)
    try {
      const p = await api.crearPedido({ ...form, n_remito: n, cliente: form.cliente.trim() }, archivo, vendedorId)
      setCreado(p)
      void recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  function otro() {
    setForm(vacio()); setArchivo(null); setAviso(null); setGuia(null); setDuplicado(null); setCreado(null); setError(null)
  }

  if (lote) return <CargaVarios archivos={lote} onSalir={() => setLote(null)} />

  if (creado) {
    const vendedor = usuarios.find((u) => u.id === creado.vendedor_id)?.nombre ?? yo.nombre
    const msg = mensajeGrupo(creado, creado.expreso_id ? expresosPorId.get(creado.expreso_id) : undefined, vendedor)
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <div className="eyebrow">Remito cargado</div>
            <h1>Listo, ya está en la cola de expedición</h1>
            <p>Pedido #{creado.codigo} · {creado.cliente}</p>
          </div>
        </div>
        <div className="panel panel-pad stack">
          <div className="row"><EstadoChip pedido={creado} /> <span className="muted small">Expedición lo ve ahora en "Expedición hoy".</span></div>
          <div className="field">
            <span>Mensaje para el grupo de WhatsApp</span>
            <div className="mensaje-preview">{msg}</div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void copiar(msg, 'Mensaje copiado: pegalo en el grupo')}><Copy size={16} /> Copiar mensaje</button>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Abrir WhatsApp</a>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={otro}><Plus size={16} /> Cargar otro</button>
            <a className="btn btn-ghost" href={`#/p/${creado.codigo}`}>Ver pedido <ArrowRight size={16} /></a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Nuevo</div>
          <h1>Cargar remito</h1>
          <p>Subí el PDF de Contabilium: los datos se completan solos. Podés soltar varios PDFs juntos.</p>
        </div>
      </div>

      <div className="stack">
        <div className="panel panel-pad stack">
          {archivo ? (
            <div className="archivo-cargado">
              <FileText size={20} />
              <div style={{ minWidth: 0 }}>
                <b className="small" style={{ display: 'block' }}>{archivo.name}</b>
                <span className="small">{leyendo ? 'Leyendo…' : `${Math.round(archivo.size / 1024)} KB`}</span>
              </div>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => { setArchivo(null); set('remito_hash', null); setAviso(null); setGuia(null); setError(null) }}>Cambiar</button>
            </div>
          ) : (
            <label
              className={`drop${encima ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
              onDragLeave={() => setEncima(false)}
              onDrop={soltar}
            >
              <Upload size={28} />
              <b>Arrastrá los remitos acá o tocá para elegirlos</b>
              <span className="muted small">PDF de Contabilium (también acepta foto) · uno o varios a la vez</span>
              <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { recibir(e.target.files); e.target.value = '' }} />
            </label>
          )}
          {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.tipo === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />} {aviso.texto}</div>}
          {guia && archivo && <AvisoGuia emp={guia.emp} onSubir={() => setSubirComoGuia(archivo)} />}
          {duplicado && (
            <div className="aviso err">
              <AlertTriangle size={16} />
              <span>Este remito ya está cargado (pedido #{duplicado.codigo}, {duplicado.cliente}). <a href={`#/p/${duplicado.codigo}`}>Abrirlo</a></span>
            </div>
          )}
        </div>

        <div className="panel panel-pad stack">
          <div className="field">
            <span>¿Por dónde va?</span>
            <div className="expresos-pick" style={columnasPick(activos.length)}>
              {activos.map((e) => (
                <button key={e.id} type="button" className="expreso-opt" aria-pressed={form.expreso_id === e.id} onClick={() => set('expreso_id', e.id)}>
                  <b>{e.nombre}</b>
                  <span>{e.requiere_guia ? `~${e.dias_esperados} días hábiles` : 'Sin guía'}</span>
                </button>
              ))}
            </div>
          </div>
          <DepositoSalida valor={form.deposito_salida ?? null} onChange={(v) => set('deposito_salida', v)} />
        </div>

        <div className="panel panel-pad stack">
          <div className="grid-3">
            <label className="field">
              <span>N° de remito</span>
              <input className="control mono" value={form.n_remito} onChange={(e) => set('n_remito', e.target.value)} onBlur={(e) => e.target.value && set('n_remito', normalizarNumeroRemito(e.target.value))} placeholder="0006-00012345" />
            </label>
            <label className="field span-2">
              <span>Cliente</span>
              <input className="control" value={form.cliente} onChange={(e) => set('cliente', e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Dirección de entrega</span>
            <input className="control" value={form.direccion ?? ''} onChange={(e) => set('direccion', e.target.value || null)} />
          </label>
          <div className="grid-3">
            <label className="field">
              <span>Localidad</span>
              <input className="control" value={form.localidad ?? ''} onChange={(e) => set('localidad', e.target.value || null)} />
            </label>
            <label className="field">
              <span>Provincia</span>
              <input className="control" value={form.provincia ?? ''} onChange={(e) => set('provincia', e.target.value || null)} />
            </label>
            <label className="field">
              <span>CP</span>
              <input className="control" value={form.cp ?? ''} onChange={(e) => set('cp', e.target.value || null)} />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Teléfono de contacto</span>
              <input className="control" type="tel" value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value || null)} />
            </label>
            <label className="field">
              <span>Recibe <span className="hint">(nombre, si no es el titular)</span></span>
              <input className="control" value={form.contacto ?? ''} onChange={(e) => set('contacto', e.target.value || null)} />
            </label>
          </div>
          <label className="field">
            <span>Nota para expedición <span className="hint">(opcional)</span></span>
            <textarea className="control" value={form.nota ?? ''} onChange={(e) => set('nota', e.target.value || null)} placeholder="Ej: entregar antes del viernes, horario de 8 a 12, despacho a cargo del cliente…" />
          </label>
          {puedeElegirVendedor && (
            <label className="field">
              <span>Vendedor</span>
              <select className="control" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                {!vendedorId && <option value="">Elegí el vendedor…</option>}
                {vendedores.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </label>
          )}
          {form.items.length > 0 && <ItemsMini items={form.items} />}
        </div>

        {error && <div className="aviso err"><AlertTriangle size={16} /> {error}</div>}
        <div className="row">
          <button className="btn" onClick={() => ir('/')}>Cancelar</button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando || leyendo || !!guia}>
            {guardando ? 'Guardando…' : 'Cargar remito'}
          </button>
        </div>
      </div>
      {subirComoGuia && <SubirGuias iniciales={[subirComoGuia]} onClose={() => { setSubirComoGuia(null); otro() }} />}
    </div>
  )
}

/** El archivo elegido es una guía del expreso: dice de qué pedido es y ofrece subirla como guía. */
function AvisoGuia({ emp, onSubir }: { emp: Emparejamiento | null; onSubir: () => void }) {
  const p = emp?.pedidos.length === 1 ? emp.pedidos[0] : null
  if (p && (p.n_guia || p.tiene_guia_archivo)) {
    return (
      <div className="aviso info">
        <Check size={16} />
        <span>Es la guía del pedido <b>#{p.codigo} · {p.cliente}</b> (remito {p.n_remito}), y ese pedido <b>ya tiene la guía cargada</b>
          {p.n_guia ? ` (N° ${p.n_guia})` : ''}. No hace falta subirla de nuevo. <a href={`#/p/${p.codigo}`}>Abrir el pedido</a></span>
      </div>
    )
  }
  return (
    <div className="aviso info stack" style={{ gap: 8 }}>
      <span>{p ? <>Es la guía del pedido <b>#{p.codigo} · {p.cliente}</b> (remito {p.n_remito}, encontrado {CRITERIO_LABEL[emp!.por]}).</>
        : emp?.pedidos.length ? <>Puede ser de {emp.pedidos.length} pedidos de {emp.pedidos[0].cliente}: elegí cuál al subirla.</>
        : <>No encontré a qué pedido corresponde: lo elegís al subirla.</>}</span>
      <div><button className="btn btn-primary btn-sm" onClick={onSubir}><Upload size={15} /> Subirla como guía</button></div>
    </div>
  )
}

/** Opciones de expreso al ancho de la página: todas en una fila; en tablet, la mitad por fila (6 → 3 + 3);
 * en el celular, de a 2. Así nunca queda una sola suelta abajo (Felipe, 20/11). */
export function columnasPick(n: number): CSSProperties {
  return { '--n': Math.max(n, 1), '--mitad': Math.max(Math.ceil(n / 2), 1) } as CSSProperties
}

export function ItemsMini({ items }: { items: ItemRemito[] }) {
  return (
    <div className="field">
      <span>Productos del remito</span>
      <ul className="items-mini">
        {items.map((it, i) => <li key={i}><b className="num">{it.cantidad}×</b> {it.descripcion} <span className="mono muted">{it.codigo}</span></li>)}
      </ul>
    </div>
  )
}
