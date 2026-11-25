// PARCHE CONTEO (1b del CRM): guías y remitos que se subieron sin pedido y el CRM no pudo emparejar solo.
// Cada uno muestra sus candidatos (por remito, CUIT o teléfono) y deja elegir entre los pedidos que salieron sin guía.
import { ExternalLink, FileText, ImageIcon, Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { mensajeError } from '../lib/api'
import { useDatos } from '../lib/datos'
import { asignarArchivo, type ArchivoSinAsignar } from '../lib/expedicionApi'
import { fechaCorta, hace } from '../lib/fechas'
import { Empty, useToast } from './ui'

const TIPO: Record<string, string> = { guia: 'Guía', remito: 'Remito', remito_firmado: 'Remito firmado' }

export function SinAsignar({ archivos, cargando, error, onCambio }: { archivos: ArchivoSinAsignar[]; cargando: boolean; error: string | null; onCambio: () => Promise<void> }) {
  const { pedidos } = useDatos()
  const avisar = useToast()
  const [elegido, setElegido] = useState<Record<string, string>>({})
  const [trabajando, setTrabajando] = useState<string | null>(null)
  // para elegir a mano: lo que está abierto o salió en los últimos días, más nuevo primero
  const opciones = useMemo(() => pedidos.filter((p) => p.estado !== 'cancelado').slice().sort((a, b) => (b.fecha_despacho ?? b.created_at).localeCompare(a.fecha_despacho ?? a.created_at)).slice(0, 150), [pedidos])

  async function asignar(a: ArchivoSinAsignar, pedido: string) {
    if (!pedido) return
    setTrabajando(a.id)
    try {
      await asignarArchivo(a.id, pedido)
      const p = pedidos.find((x) => x.id === pedido)
      avisar(`Listo: ${(TIPO[a.tipo] ?? 'archivo').toLowerCase()} guardado${p ? ` en ${p.cliente}` : ''}`)
      await onCambio()
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setTrabajando(null)
    }
  }

  if (cargando) return <div className="stack" style={{ padding: 16 }}>{[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 70 }} />)}</div>
  if (error) return <div className="aviso err" style={{ margin: 12 }}>{error} <button className="btn btn-sm" onClick={() => void onCambio()}>Reintentar</button></div>
  if (!archivos.length) return <Empty icono={Inbox} titulo="No hay archivos sin asignar">Todo lo que se subió encontró su pedido.</Empty>

  return (
    <>
      {archivos.map((a) => (
        <div key={a.id} className="exp-card">
          <div className="top">
            <div className="info">
              <b>{a.mime?.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />} {TIPO[a.tipo] ?? a.tipo}{a.n_guia ? <> · <span className="mono">{a.n_guia}</span></> : null}</b>
              <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{a.nombre} · subió {a.operador ?? '—'}{a.deposito ? ` (${a.deposito})` : ''} · {fechaCorta(a.created_at)} · {hace(a.created_at)}</span>
              {a.candidatos.length > 0 && <span className="small">¿Es de alguno de estos?</span>}
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {a.candidatos.map((c) => (
                  <button key={c.pedido} className="btn btn-sm" disabled={trabajando === a.id} title={c.por_texto} onClick={() => void asignar(a, c.pedido)}>
                    {c.cliente}{c.codigo ? ` · #${c.codigo}` : ''} <span className="muted small">({c.por_texto || c.por})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="acciones">
            {a.url && <a className="btn btn-sm" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver</a>}
            <select className="control" style={{ maxWidth: 260 }} aria-label="Elegir el pedido" value={elegido[a.id] ?? ''} onChange={(e) => setElegido({ ...elegido, [a.id]: e.target.value })}>
              <option value="">Elegir otro pedido…</option>
              {opciones.map((p) => <option key={p.id} value={p.id}>{p.cliente} · {p.n_remito}</option>)}
            </select>
            <button className="btn btn-sm btn-dark" disabled={!elegido[a.id] || trabajando === a.id} onClick={() => void asignar(a, elegido[a.id])}>{trabajando === a.id ? 'Guardando…' : 'Asignar'}</button>
          </div>
        </div>
      ))}
      <p className="small muted" style={{ padding: '8px 12px', margin: 0 }}>Si no sabés de quién es, dejalo: el comercial lo identifica desde el CRM.</p>
    </>
  )
}
