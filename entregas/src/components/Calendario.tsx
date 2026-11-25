// Calendario mensual: qué salió cada día, qué se entregó y cuándo se espera stock.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDatos } from '../lib/datos'
import { aISO, hoyISO, inicioSemana, sumarDiasHabiles, desdeISO } from '../lib/fechas'
import type { Pedido } from '../lib/types'
import { DetalleDia } from './CalendarioDia'

// PARCHE CONTEO: colores por expreso (alternativa a colorear por tipo de movimiento)
const PALETA = [['#e3edff', '#1d4fa3'], ['#e5f5ec', '#146c3a'], ['#fff1d6', '#8a5a00'], ['#f3e5ff', '#6b2bb0'], ['#ffe3e5', '#b3202b'], ['#ddf4f6', '#0e6a74'], ['#f1ecdf', '#6a5a2b'], ['#e8e8ec', '#3d3e41']]

export type Capa = 'despacho' | 'entrega' | 'stock' | 'estimada'
export interface EventoDia { p: Pedido; capa: Capa }

export const CAPAS: { id: Capa; label: string; tono: string }[] = [
  { id: 'despacho', label: 'Despachos', tono: 'tono-transito' },
  { id: 'entrega', label: 'Entregas', tono: 'tono-ok' },
  { id: 'estimada', label: 'Llegada estimada', tono: 'tono-info' },
  { id: 'stock', label: 'Stock esperado', tono: 'tono-alerta' },
]

const angosto = () => window.matchMedia('(max-width: 860px)').matches

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function Calendario() {
  const { yo, pedidos, expresosPorId, expresos } = useDatos()
  const [colorPor, setColorPor] = useState<'tipo' | 'expreso'>('tipo')
  const colorExp = (p: Pedido) => { const i = expresos.findIndex((x) => x.id === p.expreso_id); const c = PALETA[(i < 0 ? PALETA.length - 1 : i) % PALETA.length]; return { background: c[0], color: c[1] } }
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1) })
  const [capas, setCapas] = useState<Set<Capa>>(new Set(['despacho', 'entrega', 'estimada', 'stock']))
  const [mios, setMios] = useState(yo.rol === 'vendedor')
  /** Día abierto con su detalle (al tocar un día o «+N más»). */
  const [abierto, setAbierto] = useState<string | null>(null)

  const eventos = useMemo(() => {
    const porDia = new Map<string, EventoDia[]>()
    const add = (dia: string | null, p: Pedido, capa: Capa) => {
      if (!dia || !capas.has(capa)) return
      if (!porDia.has(dia)) porDia.set(dia, [])
      porDia.get(dia)!.push({ p, capa })
    }
    for (const p of pedidos) {
      if (mios && p.vendedor_id !== yo.id) continue
      if (p.estado === 'cancelado') continue
      add(p.fecha_despacho, p, 'despacho')
      if (p.estado === 'entregado') add(p.fecha_entrega, p, 'entrega')
      if (p.estado === 'despachado' && p.fecha_despacho) {
        const e = p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined
        if (e?.requiere_guia) add(aISO(sumarDiasHabiles(desdeISO(p.fecha_despacho), e.dias_esperados)), p, 'estimada')
      }
      if (p.estado === 'bloqueado' && p.bloqueo_motivo === 'sin_stock') add(p.stock_estimado, p, 'stock')
    }
    return porDia
  }, [pedidos, capas, mios, yo.id, expresosPorId])

  const dias = useMemo(() => {
    const ini = inicioSemana(mes)
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const out: Date[] = []
    const d = new Date(ini)
    while (d <= fin || out.length % 7 !== 0) { out.push(new Date(d)); d.setDate(d.getDate() + 1) }
    return out
  }, [mes])

  const hoy = hoyISO()
  const mover = (n: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const toggle = (c: Capa) => setCapas((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Agenda</div>
          <h1>{MESES[mes.getMonth()]} {mes.getFullYear()}</h1>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
          <button className="btn" onClick={() => { const h = new Date(); setMes(new Date(h.getFullYear(), h.getMonth(), 1)) }}>Hoy</button>
          <button className="btn" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="chip-btn" aria-pressed={mios} onClick={() => setMios(true)}>Mis pedidos</button>
        <button className="chip-btn" aria-pressed={!mios} onClick={() => setMios(false)}>Todos</button>
        <span style={{ width: 8 }} />
        {colorPor === 'tipo' && CAPAS.map((c) => (
          <button key={c.id} className="chip-btn cal-capa" aria-pressed={capas.has(c.id)} onClick={() => toggle(c.id)}>
            <span className={`chip ${c.tono}`} style={{ minHeight: 10, padding: '0 5px' }}>&nbsp;</span> {c.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="hint">Colorear por:</span>
        <button className="chip-btn" aria-pressed={colorPor === 'tipo'} onClick={() => setColorPor('tipo')}>Tipo (despacho, entrega…)</button>
        <button className="chip-btn" aria-pressed={colorPor === 'expreso'} onClick={() => setColorPor('expreso')}>Expreso</button>
      </div>
      {colorPor === 'expreso' && (
        <div className="row" style={{ marginBottom: 12 }}>
          {expresos.map((x, i) => <span key={x.id} className="chip" style={{ background: PALETA[i % PALETA.length][0], color: PALETA[i % PALETA.length][1] }}>{x.nombre}</span>)}
        </div>
      )}

      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="cal">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div key={d} className="cal-h">{d}</div>)}
          {dias.map((d) => {
            const iso = aISO(d)
            const evs = eventos.get(iso) ?? []
            const fuera = d.getMonth() !== mes.getMonth()
            return (
              <div
                key={iso}
                className={`cal-d${fuera ? ' fuera' : ''}${iso === hoy ? ' hoy' : ''}${evs.length ? ' con-eventos' : ''}`}
                role={evs.length ? 'button' : undefined}
                tabIndex={evs.length ? 0 : undefined}
                aria-label={evs.length ? `${d.getDate()}: ${evs.length} movimiento${evs.length === 1 ? '' : 's'}. Ver el detalle` : undefined}
                onClick={(e) => {
                  if (!evs.length) return
                  // En la compu, tocar un nombre abre ese pedido; en el celular los nombres son chicos: siempre abre el día.
                  if ((e.target as HTMLElement).closest('a') && !angosto()) return
                  e.preventDefault()
                  setAbierto(iso)
                }}
                onKeyDown={(e) => { if (evs.length && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setAbierto(iso) } }}
              >
                <span className="n">{d.getDate()}</span>
                {evs.slice(0, 4).map(({ p, capa }) => (
                  <a key={`${p.id}-${capa}`} className={`cal-ev ${colorPor === 'tipo' ? CAPAS.find((c) => c.id === capa)!.tono : ''}`} style={colorPor === 'expreso' ? colorExp(p) : undefined} href={`#/p/${p.codigo}`} title={`${CAPAS.find((c) => c.id === capa)!.label}: ${p.cliente} (${p.n_remito})`}>
                    {p.cliente}
                  </a>
                ))}
                {evs.length > 4 && <span className="cal-mas">+{evs.length - 4} más</span>}
                {evs.length > 0 && <span className="cal-cuenta" aria-hidden="true">{evs.length}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Tocá un día para ver el detalle de lo que pasó.</p>

      {abierto && <DetalleDia iso={abierto} eventos={eventos.get(abierto) ?? []} onClose={() => setAbierto(null)} />}
    </div>
  )
}
