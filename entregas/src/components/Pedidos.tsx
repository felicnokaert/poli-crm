import { guiaLegible, quienDespacho } from '../lib/mensajes'
import { leadTime } from '../lib/leadtime'
import { RelojLead } from './LeadTime'
import { AlertCircle, CalendarDays, ChevronRight, Download, Inbox, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDatos, useNombre } from '../lib/datos'
import { alertaDe, ESTADO_INFO, ESTADOS, faltantesDe, PELOTA_LABEL, pelotaEn } from '../lib/estados'
import { diasCorridos, fechaCorta } from '../lib/fechas'
import {
  aplicarFiltros, FILTROS_DEFAULT, ordenar, PERIODO_LABEL, VISTA_LABEL, type CampoFecha, type Filtros, type Orden, type Periodo, type Vista,
} from '../lib/filtros'
import type { Estado, Pedido, Pelota } from '../lib/types'
import { Empty, EstadoChip, Faltantes, Listos, PelotaTag } from './ui'

function filtrosDesdeQuery(q: URLSearchParams, yoId: string, esVendedor: boolean): Filtros {
  const f: Filtros = { ...FILTROS_DEFAULT, vendedorId: esVendedor ? yoId : '' }
  const vista = q.get('vista') as Vista | null
  if (vista && vista in VISTA_LABEL) f.vista = vista
  const estado = q.get('estado')
  if (estado) { f.estados = estado.split(',').filter((e) => ESTADOS.includes(e as Estado)) as Estado[]; if (!vista) f.vista = 'todos' }
  const pelota = q.get('pelota') as Pelota | null
  if (pelota && pelota in PELOTA_LABEL) f.pelota = pelota
  if (q.get('expreso')) f.expresoId = q.get('expreso')!
  if (q.get('mios') === '0') f.vendedorId = ''
  if (q.get('mios') === '1') f.vendedorId = yoId
  const periodo = q.get('periodo') as Periodo | null
  if (periodo && periodo in PERIODO_LABEL) f.periodo = periodo
  const campo = q.get('fecha') as CampoFecha | null
  if (campo) f.campoFecha = campo
  return f
}

export function Pedidos({ query }: { query: URLSearchParams }) {
  const { yo, pedidos, expresos, expresosPorId, usuarios, config, cargando, error } = useDatos()
  const [f, setF] = useState<Filtros>(() => filtrosDesdeQuery(query, yo.id, yo.rol === 'vendedor'))
  const [orden, setOrden] = useState<Orden>('atencion')
  const [verFiltros, setVerFiltros] = useState(false)
  const bloqueo = query.get('bloqueo')
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((x) => ({ ...x, [k]: v }))

  const base = useMemo(() => {
    const lista = aplicarFiltros(pedidos, { ...f, vista: 'todos', estados: [] }, expresosPorId, config)
    return bloqueo ? lista.filter((p) => p.estado === 'bloqueado' && p.bloqueo_motivo === bloqueo) : lista
  }, [pedidos, f, expresosPorId, config, bloqueo])
  const visibles = useMemo(
    () => ordenar(aplicarFiltros(base, f, expresosPorId, config), orden, expresosPorId, config),
    [base, f, orden, expresosPorId, config],
  )
  const porVista = useMemo(() => {
    const out = {} as Record<Vista, number>
    for (const v of Object.keys(VISTA_LABEL) as Vista[]) out[v] = aplicarFiltros(base, { ...f, vista: v, estados: [] }, expresosPorId, config).length
    return out
  }, [base, f, expresosPorId, config])

  const vendedores = usuarios.filter((u) => u.rol !== 'expedicion')
  const hayFiltros = f.texto || f.estados.length || f.expresoId || f.pelota || (yo.rol === 'vendedor' ? f.vendedorId !== yo.id : f.vendedorId)

  function exportar() {
    const cols = ['Pedido', 'Remito', 'Fecha carga', 'Cliente', 'Localidad', 'Provincia', 'Expreso', 'Sale desde', 'Estado', 'Le toca a', 'Despacho', 'Despachó', 'Depósito', 'Lead time (h de jornada)', 'Guía', 'Entrega', 'Vendedor', 'Alerta']
    const filas = visibles.map((p) => {
      const e = p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined
      const pel = pelotaEn(p)
      return [p.codigo, p.n_remito, fechaCorta(p.created_at), p.cliente, p.localidad ?? '', p.provincia ?? '', e?.nombre ?? '', p.deposito_salida ?? '', ESTADO_INFO[p.estado].label,
        pel ? PELOTA_LABEL[pel] : '', p.fecha_despacho ?? '',
        p.despacho_operador ?? (p.despacho_user_id ? usuarios.find((u) => u.id === p.despacho_user_id)?.nombre : null) ?? quienDespacho(p), p.despacho_deposito ?? '',
        (() => { const l = leadTime(p); return l && !l.corriendo ? String(l.horas).replace('.', ',') : '' })(),
        p.n_guia ?? '', p.fecha_entrega ?? '', usuarios.find((u) => u.id === p.vendedor_id)?.nombre ?? '',
        alertaDe(p, e, config)?.texto ?? '']
    })
    const csv = [cols, ...filas].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `entregas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Seguimiento</div>
          <h1>Pedidos</h1>
          <p>{yo.rol === 'vendedor' && f.vendedorId === yo.id ? 'Tus remitos' : 'Todos los remitos'} · {visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'}</p>
        </div>
        <div className="head-actions">
          <button className="btn desktop-only" onClick={exportar} disabled={!visibles.length}><Download size={16} /> Exportar</button>
          <a className="btn btn-primary" href="#/nuevo"><Plus size={16} /> Cargar remito</a>
        </div>
      </div>

      <div className="panel toolbar">
        <div className="search">
          <Search size={16} />
          <input className="control" type="search" placeholder="Buscar por cliente, N° de remito, guía, localidad o teléfono…" value={f.texto} onChange={(e) => set('texto', e.target.value)} />
        </div>
        <div className="chips-scroll" role="group" aria-label="Vista">
          {(Object.keys(VISTA_LABEL) as Vista[]).map((v) => (
            <button key={v} className="chip-btn" aria-pressed={f.vista === v && !f.estados.length} onClick={() => setF((x) => ({ ...x, vista: v, estados: [] }))}>
              {v === 'atencion' && <AlertCircle size={13} />} {VISTA_LABEL[v]} <span className="cnt">{porVista[v]}</span>
            </button>
          ))}
        </div>
        <div className="periodos" role="group" aria-label="Período">
          <span className="lbl"><CalendarDays size={13} style={{ verticalAlign: '-2px' }} /> Cuándo</span>
          {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
            <button key={p} className="chip-btn" aria-pressed={f.periodo === p} onClick={() => set('periodo', p)}>{p === 'todo' ? 'Siempre' : PERIODO_LABEL[p]}</button>
          ))}
          {f.periodo !== 'todo' && (
            <select className="control" style={{ width: 'auto', minHeight: 32 }} value={f.campoFecha} onChange={(e) => set('campoFecha', e.target.value as CampoFecha)} aria-label="Según fecha de">
              <option value="carga">según cuándo se cargó</option>
              <option value="despacho">según cuándo salió</option>
              <option value="entrega">según cuándo se entregó</option>
            </select>
          )}
          {f.periodo === 'rango' && (
            <>
              <input className="control" style={{ width: 'auto', minHeight: 32 }} type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} aria-label="Desde" />
              <input className="control" style={{ width: 'auto', minHeight: 32 }} type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} aria-label="Hasta" />
            </>
          )}
        </div>
        <button className="btn btn-sm filtros-toggle" onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}>
          <SlidersHorizontal size={15} /> Filtros{hayFiltros ? ' (activos)' : ''}
        </button>
        <div className={`filters${verFiltros ? ' abierto' : ''}`}>
          <select className="control" value={f.estados[0] ?? ''} onChange={(e) => setF((x) => ({ ...x, estados: e.target.value ? [e.target.value as Estado] : [], vista: e.target.value ? 'todos' : x.vista }))} aria-label="Estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_INFO[e].label}</option>)}
          </select>
          <select className="control" value={f.expresoId} onChange={(e) => set('expresoId', e.target.value)} aria-label="Expreso">
            <option value="">Todos los expresos</option>
            {expresos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select className="control" value={f.pelota ?? ''} onChange={(e) => set('pelota', e.target.value as Pelota | '')} aria-label="Le toca a">
            <option value="">Le toca a cualquiera</option>
            <option value="expedicion">Le toca a expedición</option>
            <option value="vendedor">Le toca al vendedor</option>
            <option value="expreso">Le toca al expreso</option>
          </select>
          <select className="control" value={f.vendedorId} onChange={(e) => set('vendedorId', e.target.value)} aria-label="Vendedor">
            <option value="">Todos los vendedores</option>
            {vendedores.map((u) => <option key={u.id} value={u.id}>{u.id === yo.id ? `${u.nombre} (yo)` : u.nombre}</option>)}
          </select>
          <span className="spacer" />
          <select className="control" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Orden">
            <option value="atencion">Primero lo urgente</option>
            <option value="reciente">Más recientes</option>
            <option value="antiguo">Más viejos en su estado</option>
          </select>
          {hayFiltros ? <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...FILTROS_DEFAULT, vendedorId: yo.rol === 'vendedor' ? yo.id : '' })}>Limpiar</button> : null}
        </div>
      </div>

      {error && <div className="aviso err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="panel">
        <div className="lista-head"><span>Cliente / remito</span><span>Estado</span><span>Envío</span><span>Le toca a</span><span /></div>
        {cargando ? (
          <div className="stack" style={{ padding: 18 }}>{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>
        ) : visibles.length === 0 ? (
          <Empty icono={Inbox} titulo={pedidos.length ? 'Nada con estos filtros' : 'Todavía no hay remitos cargados'}>
            {pedidos.length ? <button className="btn btn-sm" onClick={() => setF({ ...FILTROS_DEFAULT, vista: 'todos' })}>Ver todos</button> : <a className="btn btn-primary btn-sm" href="#/nuevo">Cargar el primero</a>}
          </Empty>
        ) : (
          <div className="lista">{visibles.map((p) => <PedidoFila key={p.id} pedido={p} />)}</div>
        )}
      </div>
    </div>
  )
}

export function PedidoFila({ pedido: p, compacta }: { pedido: Pedido; compacta?: boolean }) {
  const { expresosPorId, config, yo } = useDatos()
  const nombre = useNombre()
  const e = p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined
  const alerta = alertaDe(p, e, config)
  const falt = faltantesDe(p, e)
  const dias = diasCorridos(p.estado_desde)
  return (
    <a className={`fila${alerta ? ' alerta' : ''}${compacta ? ' compacta' : ''}`} href={`#/p/${p.codigo}`}>
      <div className="cell">
        <span className="cli">{p.cliente}</span>
        <span className="sub"><span className="mono">{p.n_remito}</span> · {[p.localidad, p.provincia].filter(Boolean).join(', ') || 'Sin localidad'}{p.vendedor_id !== yo.id ? ` · ${nombre(p.vendedor_id, p.vendedor_email)}` : ''}</span>
      </div>
      <div className="cell">
        <div className="row" style={{ gap: 5 }}><EstadoChip pedido={p} corto /> <Faltantes lista={falt} /> <Listos pedido={p} /></div>
        {alerta ? <span className="alerta-txt"><AlertCircle size={12} /> {alerta.texto}</span> : <span className="sub">{dias === 0 ? 'desde hoy' : `hace ${dias} ${dias === 1 ? 'día' : 'días'}`}</span>}
      </div>
      <div className="cell envio">
        <span>{e?.nombre ?? <span className="muted">Sin expreso</span>}</span>
        <span className="sub">
          {p.fecha_despacho ? `Salió ${fechaCorta(p.fecha_despacho)}` : `Cargado ${fechaCorta(p.created_at)}`}
          {p.n_guia ? <> · <span className="mono">{guiaLegible(p.n_guia)}</span></> : null}
        </span>
        <RelojLead pedido={p} />
      </div>
      <div className="cell"><PelotaTag pelota={pelotaEn(p)} prefijo={false} /></div>
      <ChevronRight size={18} className="chev" />
    </a>
  )
}
