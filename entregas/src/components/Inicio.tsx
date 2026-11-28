import { AlertCircle, FileWarning, MessageSquare, PackageCheck, Paperclip, PauseCircle, Plus, Printer, Timer, Truck } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/cliente'
import { useDatos, useNombre } from '../lib/datos'
import { alertaDe, ESTADO_INFO } from '../lib/estados'
import { fechaLarga, hace } from '../lib/fechas'
import { contar, tiemposPorExpreso } from '../lib/metricas'
import { duracion, resumenLead } from '../lib/leadtime'
import type { Estado, Evento } from '../lib/types'
import { PedidoFila } from './Pedidos'
import { AvisoCierre } from './ResumenDia'
import { ShopifyPedidos } from './ShopifyPedidos'
import { Empty, ICONO_ESTADO } from './ui'

export function Inicio() {
  const { yo, pedidos, expresos, expresosPorId, config, cargando, version } = useDatos()
  const nombre = useNombre()
  const [mios, setMios] = useState(yo.rol === 'vendedor')
  const [eventos, setEventos] = useState<Evento[]>([])

  const base = useMemo(() => (mios ? pedidos.filter((p) => p.vendedor_id === yo.id) : pedidos), [pedidos, mios, yo.id])
  const c = useMemo(() => contar(base, expresosPorId, config), [base, expresosPorId, config])
  const urgentes = useMemo(
    () => base.filter((p) => alertaDe(p, p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined, config))
      .sort((a, b) => a.estado_desde.localeCompare(b.estado_desde)).slice(0, 8),
    [base, expresosPorId, config],
  )
  const lead = useMemo(() => {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
    return resumenLead(base.filter((p) => p.impreso_at && p.impreso_at >= desde))
  }, [base])
  const tiempos = useMemo(() => {
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()
    return tiemposPorExpreso(base.filter((p) => p.created_at >= desde), expresos).filter((t) => t.expreso.requiere_guia)
  }, [base, expresos])

  useEffect(() => {
    const desde = new Date(Date.now() - 3 * 86_400_000).toISOString()
    void api.eventosRecientes(desde).then(setEventos).catch(() => setEventos([]))
  }, [version])

  const idsBase = useMemo(() => new Set(base.map((p) => p.id)), [base])
  const pedidosPorId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos])
  const movimientos = eventos.filter((e) => idsBase.has(e.pedido_id) && !(e.user_id === yo.id && (e.operador ?? null) === (yo.operador ?? null)) && e.tipo !== 'alta').slice(0, 12)
  const q = (extra: string) => `#/pedidos?mios=${mios ? 1 : 0}&${extra}`

  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga(new Date())}</div>
          <h1>{saludo}, {yo.nombre}</h1>
          <p>{c.requierenAtencion ? `${c.requierenAtencion} ${c.requierenAtencion === 1 ? 'pedido necesita' : 'pedidos necesitan'} atención.` : 'Todo dentro de los plazos.'}</p>
        </div>
        <div className="head-actions">
          {yo.rol !== 'expedicion' && (
            <div className="chips-scroll" role="group" aria-label="Alcance">
              <button className="chip-btn" aria-pressed={mios} onClick={() => setMios(true)}>Mis pedidos</button>
              <button className="chip-btn" aria-pressed={!mios} onClick={() => setMios(false)}>Todos</button>
            </div>
          )}
          <a className="btn btn-primary" href="#/nuevo"><Plus size={16} /> Cargar remito</a>
        </div>
      </div>

      <AvisoCierre />

      <ShopifyPedidos />

      {cargando ? (
        <div className="kpis">{Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 14 }} />)}</div>
      ) : (
      <div className="kpis">
        {/* La impresión es automática: lo cargado y lo impreso cuentan juntos como «Por salir». */}
        <Kpi href={q('estado=cargado,impreso')} icono={<Printer size={15} />} label="Por salir" valor={c.sinImprimir + c.enPreparacion}
          sub={c.sinImprimirAtrasados ? `${c.sinImprimirAtrasados} demorado${c.sinImprimirAtrasados === 1 ? '' : 's'} sin imprimir` : 'en la cola de expedición'} hot={c.sinImprimirAtrasados > 0} />
        <Kpi href={q('estado=bloqueado&bloqueo=sin_stock')} icono={<PauseCircle size={15} />} label="Sin stock" valor={c.sinStock}
          sub={c.frenadosOtros ? `+${c.frenadosOtros} frenados por otro motivo` : 'esperando reposición'} />
        <Kpi href={q('estado=despachado')} icono={<Truck size={15} />} label="En viaje" valor={c.enTransito}
          sub={c.atrasadosExpreso ? `${c.atrasadosExpreso} atrasado${c.atrasadosExpreso === 1 ? '' : 's'} en el expreso` : 'dentro del plazo'} hot={c.atrasadosExpreso > 0} />
        <Kpi href={q('vista=faltantes')} icono={<FileWarning size={15} />} label="Sin guía o firma" valor={c.sinGuia + c.sinComprobante}
          sub={`${c.sinGuia} sin guía · ${c.sinComprobante} sin firmado`} />
        <Kpi href={q('estado=incidencia')} icono={<AlertCircle size={15} />} label="Con problema" valor={c.incidencias} sub="en el envío" hot={c.incidencias > 0} />
        <Kpi href={q('vista=cerrados&periodo=mes&fecha=entrega')} icono={<PackageCheck size={15} />} label="Entregados" valor={c.entregadosMes}
          sub={`este mes · ${c.cargadosMes} cargados`} />
        <Kpi href={q('vista=todos&periodo=hoy&fecha=despacho')} icono={<Timer size={15} />} label="Salieron hoy" valor={c.despachadosHoy}
          sub={lead.promedio !== null ? `lead time ${duracion(lead.promedio)} (prom. 30 días)` : 'despachados hoy'} />
      </div>
      )}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Requieren atención</h2>
            <a className="btn btn-sm btn-ghost" href={q('vista=atencion')}>Ver todos</a>
          </div>
          {cargando ? <div style={{ padding: 18 }}><div className="skeleton" style={{ height: 120 }} /></div>
            : urgentes.length === 0 ? <Empty icono={PackageCheck} titulo="Nada demorado">Todos los pedidos están dentro de los plazos.</Empty>
              : <div className="lista">{urgentes.map((p) => <PedidoFila key={p.id} pedido={p} compacta />)}</div>}
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Novedades</h2><span className="muted small">últimos 3 días</span></div>
            {movimientos.length === 0 ? (
              <div className="muted small" style={{ padding: 18 }}>Sin movimientos de otros en {mios ? 'tus pedidos' : 'los pedidos'}.</div>
            ) : (
              <ul className="timeline" style={{ paddingTop: 10 }}>
                {movimientos.map((e) => {
                  const p = pedidosPorId.get(e.pedido_id)
                  return (
                    <li key={e.id}>
                      <span className={`dot ${e.tipo}`}>{e.tipo === 'estado' && e.a_estado ? (() => { const I = ICONO_ESTADO[e.a_estado]; return <I size={12} /> })() : e.tipo === 'comentario' ? <MessageSquare size={12} /> : <Paperclip size={12} />}</span>
                      <div>
                        <div className="t-head">
                          <b>{nombre(e.user_id, e.user_email, e.operador)}</b> {textoEvento(e)}{' '}
                          {p && <a href={`#/p/${p.codigo}`}>{p.cliente}</a>}
                        </div>
                        <div className="t-meta">{hace(e.created_at)}</div>
                        {e.tipo === 'comentario' && e.nota && <div className="t-nota">{e.nota}</div>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Cómo vienen los expresos</h2><span className="muted small">últimos 90 días</span></div>
            {tiempos.length === 0 ? <div className="muted small" style={{ padding: 18 }}>Todavía no hay envíos para medir.</div> : (
              <table className="tabla">
                <thead><tr><th>Expreso</th><th className="r">Envíos</th><th className="r" title="Días hábiles desde que se cargó el remito hasta que salió">Salida</th><th className="r" title="Días hábiles desde el despacho hasta la entrega">Viaje</th><th className="r">A tiempo</th></tr></thead>
                <tbody>
                  {tiempos.map((t) => (
                    <tr key={t.expreso.id}>
                      <td><b>{t.expreso.nombre}</b>{t.enTransito ? <div className="muted small">{t.enTransito} en viaje</div> : null}</td>
                      <td className="r num">{t.enviados}</td>
                      <td className="r num">{t.cargaADespacho ?? '—'}{t.cargaADespacho != null ? ' d' : ''}</td>
                      <td className="r num">{t.despachoAEntrega ?? '—'}{t.despachoAEntrega != null ? ' d' : ''}</td>
                      <td className="r num">{t.aTiempo != null ? `${t.aTiempo}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="muted small" style={{ padding: '0 14px 12px' }}>"Salida" mide lo interno (de la carga al despacho); "Viaje" mide al expreso. Días hábiles.</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function textoEvento(e: Evento): string {
  if (e.tipo === 'estado' && e.a_estado) {
    if (e.a_estado === 'cargado' && e.de_estado === 'impreso') return 'deshizo "impreso" en'
    if (e.a_estado === 'cargado' && e.de_estado === 'bloqueado') return 'destrabó'
    return `marcó ${ESTADO_INFO[e.a_estado as Estado].corto.toLowerCase()}:`
  }
  if (e.tipo === 'comentario') return 'comentó en'
  if (e.tipo === 'archivo') {
    const d = (e.datos ?? {}) as { tipo?: string; accion?: string }
    if (d.accion === 'borro') return 'borró un archivo de'
    return d.tipo === 'guia' ? 'subió la guía de' : d.tipo === 'remito_firmado' ? 'subió el remito firmado de' : 'subió un archivo a'
  }
  if (e.tipo === 'edicion') return 'corrigió datos de'
  return 'actualizó'
}

function Kpi({ href, icono, label, valor, sub, hot }: { href: string; icono: ReactNode; label: string; valor: number; sub: string; hot?: boolean }) {
  return (
    <a className={`kpi${hot ? ' hot' : ''}${valor === 0 ? ' zero' : ''}`} href={href}>
      <span className="k-label">{icono} {label}</span>
      <span className="k-val">{valor}</span>
      <span className="k-sub">{sub}</span>
    </a>
  )
}
