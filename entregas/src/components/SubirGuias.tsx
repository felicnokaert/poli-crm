// Subir varias guías juntas: cada archivo se lee, se busca el N° de guía y a qué pedido corresponde
// (CUIT → teléfono → razón social → dirección). Nada se guarda hasta que la persona revisa y toca «Guardar».
import { FileUp, ScanLine, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { candidatosGuia, CRITERIO_LABEL, emparejarGuia, type Criterio } from '../lib/emparejarGuia'
import { crearLectorFotos, leerGuiaCompleta, type LectorFotos } from '../lib/leerGuia'
import type { Pedido } from '../lib/types'
import { CamposGuia } from './CamposGuia'
import { ACEPTA_ARCHIVOS, Modal, soltable, useToast } from './ui'

interface Fila {
  id: string
  file: File
  leyendo: boolean
  numero: string
  pedidoId: string
  por: Criterio | null
  /** Pedidos que coincidieron (si son varios, la persona elige). */
  coinciden: string[]
}

const ESTADO_CORTO: Record<string, string> = {
  cargado: 'sin imprimir', impreso: 'para despachar', bloqueado: 'frenado', despachado: 'despachado', entregado: 'entregado', incidencia: 'con problema',
}

function etiqueta(p: Pedido): string {
  return `${p.cliente} · ${p.n_remito} · ${ESTADO_CORTO[p.estado] ?? p.estado}`
}

export function SubirGuias({ onClose, iniciales }: { onClose: () => void; /** Archivos que ya se eligieron en otra pantalla. */ iniciales?: File[] }) {
  const { pedidos, recargar } = useDatos()
  const avisar = useToast()
  const [filas, setFilas] = useState<Fila[]>([])
  const [guardando, setGuardando] = useState(false)
  const lector = useRef<Promise<LectorFotos> | null>(null)
  const candidatos = useMemo(() => candidatosGuia(pedidos).sort((a, b) => a.cliente.localeCompare(b.cliente)), [pedidos])
  const porId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos])

  useEffect(() => () => { void lector.current?.then((l) => l.cerrar()).catch(() => undefined) }, [])

  // Si viene con archivos (p. ej. una guía que se eligió en «Cargar remito»), se leen al abrir.
  const yaIniciales = useRef(false)
  useEffect(() => {
    if (yaIniciales.current || !iniciales?.length) return
    yaIniciales.current = true
    void agregarArchivos(iniciales)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function obtenerLector(): Promise<LectorFotos> {
    if (!lector.current) lector.current = crearLectorFotos()
    return lector.current
  }

  async function agregar(lista: FileList | null) {
    await agregarArchivos([...(lista ?? [])])
  }

  async function agregarArchivos(archivos: File[]) {
    if (!archivos.length) return
    const nuevas: Fila[] = archivos.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, leyendo: true, numero: '', pedidoId: '', por: null, coinciden: [] }))
    setFilas((f) => [...f, ...nuevas])
    for (const fila of nuevas) {
      let cambio: Partial<Fila> = { leyendo: false }
      try {
        const leida = await leerGuiaCompleta(fila.file, obtenerLector)
        const emp = emparejarGuia(leida.texto, candidatos)
        cambio = {
          leyendo: false,
          numero: leida.numero?.numero ?? '',
          por: emp?.por ?? null,
          coinciden: emp?.pedidos.map((p) => p.id) ?? [],
          pedidoId: emp?.pedidos[0]?.id ?? '',
        }
      } catch { /* queda para elegir a mano */ }
      setFilas((f) => f.map((x) => (x.id === fila.id ? { ...x, ...cambio } : x)))
    }
  }

  function cambiar(id: string, campos: Partial<Fila>) {
    setFilas((f) => f.map((x) => (x.id === id ? { ...x, ...campos } : x)))
  }

  const elegidos = filas.map((f) => f.pedidoId).filter(Boolean)
  const repetidos = new Set(elegidos.filter((id, i) => elegidos.indexOf(id) !== i))
  const leyendo = filas.some((f) => f.leyendo)
  const paraGuardar = filas.filter((f) => f.pedidoId && !f.leyendo)

  async function guardar() {
    setGuardando(true)
    let ok = 0
    const errores: string[] = []
    for (const f of paraGuardar) {
      const p = porId.get(f.pedidoId)
      try {
        await api.subirArchivo(f.pedidoId, 'guia', f.file)
        if (f.numero.trim() && !p?.n_guia) await api.editarPedido(f.pedidoId, { n_guia: f.numero.trim() })
        ok += 1
        setFilas((fs) => fs.filter((x) => x.id !== f.id))
      } catch (e) {
        errores.push(`${f.file.name}: ${mensajeError(e)}`)
      }
    }
    setGuardando(false)
    await recargar()
    if (ok) avisar(ok === 1 ? 'Guía guardada' : `${ok} guías guardadas`)
    if (errores.length) avisar(`No se guardaron: ${errores.join(' · ')}`, true)
    else if (ok) onClose()
  }

  return (
    <Modal titulo="Subir guías" subtitulo="Elegí una o varias guías (fotos o PDF). Busco a qué pedido es cada una: por CUIT, si no por teléfono, razón social o dirección."
      onClose={onClose}
      pie={<>
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" disabled={guardando || leyendo || !paraGuardar.length || repetidos.size > 0} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : leyendo ? 'Leyendo…' : `Guardar ${paraGuardar.length || ''} guía${paraGuardar.length === 1 ? '' : 's'}`}
        </button>
      </>}>
      <label className="guia-zona" {...soltable((fs) => void agregar(fs))}>
        <FileUp size={18} /> <b>{filas.length ? 'Sumar más guías' : 'Elegir guías'}</b>
        <span className="small muted">o arrastralas acá · PDF o fotos</span>
        <input type="file" accept={ACEPTA_ARCHIVOS} multiple hidden onChange={(e) => { void agregar(e.target.files); e.target.value = '' }} />
      </label>

      {filas.map((f) => {
        const coinciden = f.coinciden.map((id) => porId.get(id)).filter((p): p is Pedido => !!p)
        const resto = candidatos.filter((p) => !f.coinciden.includes(p.id))
        return (
          <div key={f.id} className="guia-fila">
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <b className="small" style={{ overflowWrap: 'anywhere' }}>{f.file.name}</b>
              {f.leyendo ? <span className="small muted"><ScanLine size={13} /> Leyendo…</span>
                : f.por ? <span className="chip tono-ok">Encontrado {CRITERIO_LABEL[f.por]}</span>
                : <span className="chip tono-alerta">Elegí el pedido</span>}
            </div>
            {!f.leyendo && (
              <>
                <label className="field">
                  <span>Pedido{coinciden.length > 1 ? ` (${coinciden.length} del mismo cliente: revisá cuál)` : ''}</span>
                  <select className="control" value={f.pedidoId} onChange={(e) => cambiar(f.id, { pedidoId: e.target.value })}>
                    <option value="">— No guardar esta —</option>
                    {coinciden.length > 0 && <optgroup label="Coinciden">{coinciden.map((p) => <option key={p.id} value={p.id}>{etiqueta(p)}</option>)}</optgroup>}
                    <optgroup label="Otros pedidos sin guía">{resto.map((p) => <option key={p.id} value={p.id}>{etiqueta(p)}</option>)}</optgroup>
                  </select>
                </label>
                <CamposGuia valor={f.numero} onChange={(v) => cambiar(f.id, { numero: v })}
                  pista={f.numero ? '(leído del archivo: revisalo)' : '(no lo encontré: cargalo si lo ves)'} />
                {repetidos.has(f.pedidoId) && <div className="aviso warn small"><TriangleAlert size={14} /> Elegiste el mismo pedido en dos guías.</div>}
                {f.pedidoId && porId.get(f.pedidoId)?.n_guia && <div className="aviso info small">Ese pedido ya tiene N° de guía: se suma el archivo y no se cambia el número.</div>}
              </>
            )}
          </div>
        )
      })}
      {!filas.length && <p className="small muted" style={{ margin: 0 }}>Solo se proponen pedidos que todavía no tienen guía. Nada se guarda hasta que toques «Guardar».</p>}
    </Modal>
  )
}
