// Pantalla de trabajo de expedición, pensada para el celular: qué preparar y despachar, qué está frenado y a
// qué le falta la guía. Los remitos nuevos se imprimen en tanda desde la barra de arriba (o solos, en la compu
// marcada): ya no hay un paso «Por imprimir» a mano. Permite marcar varios a la vez.
import { AlertCircle, Camera, FileText, FileUp, HandCoins, PackageOpen, Printer, Truck, Warehouse } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { useDatos, useNombre } from '../lib/datos'
import { alertaDe, faltantesDe, MOTIVOS_BLOQUEO, pasosRetiro, puedeTransicionar } from '../lib/estados'
import { fechaCorta, fechaLarga, hace } from '../lib/fechas'
import { marcarRetirado } from '../lib/retiro'
import type { Estado, Pedido } from '../lib/types'
import { CambioEstado } from './CambioEstado'
import { BarraImpresion, useImpresion } from './Impresion'
import { useLeerGuia } from './ConfirmarGuia'
import { BotonResumen } from './ResumenDia'
import { RelojLead } from './LeadTime'
import { SubirGuias } from './SubirGuias'
import { ACEPTA_ARCHIVOS, Empty, EstadoChip, soltable, useToast } from './ui'

type Tab = 'preparar' | 'frenados' | 'guia'

const TABS: { id: Tab; label: string }[] = [
  { id: 'preparar', label: 'Para despachar' },
  { id: 'frenados', label: 'Frenados' },
  { id: 'guia', label: 'Falta la guía' },
]

export function Expedicion() {
  const { yo, pedidos, expresosPorId, config, recargar, cargando } = useDatos()
  const avisar = useToast()
  const [tab, setTab] = useState<Tab>('preparar')
  const impresion = useImpresion()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [cambio, setCambio] = useState<{ pedidos: Pedido[]; a: Estado } | null>(null)
  const leerGuia = useLeerGuia(recargar)
  const [subirGuias, setSubirGuias] = useState(false)

  const grupos = useMemo(() => {
    const porAntiguedad = (a: Pedido, b: Pedido) => a.created_at.localeCompare(b.created_at)
    return {
      preparar: pedidos.filter((p) => p.estado === 'impreso' || p.estado === 'cargado').sort(porAntiguedad),
      frenados: pedidos.filter((p) => p.estado === 'bloqueado').sort(porAntiguedad),
      guia: pedidos.filter((p) => faltantesDe(p, p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined).includes('guia'))
        .sort((a, b) => (b.fecha_despacho ?? '').localeCompare(a.fecha_despacho ?? '')),
    } satisfies Record<Tab, Pedido[]>
  }, [pedidos, expresosPorId])

  // Al entrar, abrir la primera pestaña que tenga trabajo.
  const elegida = useRef(false)
  useEffect(() => {
    if (cargando || elegida.current) return
    elegida.current = true
    const primera = TABS.find((t) => grupos[t.id].length > 0)
    if (primera) setTab(primera.id)
  }, [cargando, grupos])

  const lista = grupos[tab]
  const seleccionados = lista.filter((p) => sel.has(p.id))
  const puede = (a: Estado, p: Pedido) => puedeTransicionar(p.estado, a, yo.rol, p.vendedor_id === yo.id)
  const [retirando, setRetirando] = useState<string | null>(null)

  async function loRetiro(p: Pedido, pasos: Estado[]) {
    if (!window.confirm(`¿${p.cliente} ya retiró el pedido (remito ${p.n_remito})? Queda como entregado hoy.`)) return
    setRetirando(p.id)
    try {
      await marcarRetirado(api, p, pasos)
      avisar('Listo: lo retiró el cliente')
    } catch (err) {
      avisar(mensajeError(err), true)
    } finally {
      setRetirando(null)
      await recargar()
    }
  }
  const accionLote: Estado | null = tab === 'preparar' ? 'despachado' : null
  const loteOk = accionLote && seleccionados.length > 0 && seleccionados.every((p) => puede(accionLote, p))

  function cambiarTab(t: Tab) { setTab(t); setSel(new Set()) }
  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function abrirRemito(p: Pedido) {
    const ventana = window.open('', '_blank')
    try {
      const det = await api.obtenerPedido(p.id)
      const remito = det?.archivos.find((a) => a.tipo === 'remito')
      if (!remito) { ventana?.close(); avisar('Este pedido no tiene el PDF del remito', true); return }
      const url = await api.urlArchivo(remito)
      if (ventana) ventana.location.href = url
    } catch (e) {
      ventana?.close()
      avisar(mensajeError(e), true)
    }
  }

  async function subirGuia(p: Pedido, file: File | undefined) {
    if (!file) return
    try {
      await api.subirArchivo(p.id, 'guia', file)
      avisar('Guía subida')
      await recargar()
      leerGuia.revisar(p, file)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Depósito · {fechaLarga(new Date())}</div>
          <h1>Expedición hoy</h1>
          <p>Lo más viejo primero. Marcá lo que vas haciendo y queda avisado al vendedor.</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setSubirGuias(true)}><FileUp size={15} /> Subir guías</button>
          <BotonResumen />
        </div>
      </div>

      <BarraImpresion />

      <div className="exp-tabs" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {TABS.map((t) => (
          <button key={t.id} className="exp-tab" aria-pressed={tab === t.id} onClick={() => cambiarTab(t.id)}>
            <b className="num">{cargando ? '·' : grupos[t.id].length}</b>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="panel">
        {lista.length > 1 && accionLote && (
          <div className="panel-head">
            <label className="row small" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={seleccionados.length === lista.length} onChange={(e) => setSel(e.target.checked ? new Set(lista.map((p) => p.id)) : new Set())} style={{ width: 18, height: 18, accentColor: 'var(--ink)' }} />
              Seleccionar todos
            </label>
          </div>
        )}
        {cargando ? (
          <div className="stack" style={{ padding: 16 }}>{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 70 }} />)}</div>
        ) : lista.length === 0 ? (
          <Empty icono={PackageOpen} titulo={tab === 'preparar' ? 'No hay nada esperando salir' : tab === 'frenados' ? 'No hay pedidos frenados' : 'No falta ninguna guía'}>
            Todo al día.
          </Empty>
        ) : lista.map((p) => {
          const e = p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined
          const alerta = alertaDe(p, e, config)
          const retiro = pasosRetiro(p, e, yo.rol, yo.id)
          return (
            <div key={p.id} className="exp-card">
              <div className="top">
                {accionLote && <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Seleccionar ${p.cliente}`} />}
                <div className="info">
                  <a href={`#/p/${p.codigo}`} style={{ textDecoration: 'none' }}><b>{p.cliente}</b></a>
                  <span className="small muted"><span className="mono">{p.n_remito}</span> · {[p.localidad, p.provincia].filter(Boolean).join(', ')} · <VendedorNombre p={p} /></span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="chip tono-neutro"><Truck size={12} /> {e?.nombre ?? 'Sin expreso'}</span>
                    {p.deposito_salida && <span className="chip tono-neutro" title="Sale desde"><Warehouse size={12} /> {p.deposito_salida}</span>}
                    {tab === 'frenados' || tab === 'guia' || p.estado === 'cargado' ? <EstadoChip pedido={p} corto /> : null}
                    {p.estado === 'impreso' && <RelojLead pedido={p} conTexto />}
                    <span className="small muted">cargado {hace(p.created_at)}</span>
                  </div>
                  {p.nota && <span className="small">📝 {p.nota}</span>}
                  {tab === 'frenados' && p.bloqueo_motivo && (
                    <span className="small"><b>{MOTIVOS_BLOQUEO[p.bloqueo_motivo].label}</b>{p.bloqueo_detalle ? ` — ${p.bloqueo_detalle}` : ''}{p.stock_estimado ? ` · estimado ${fechaCorta(p.stock_estimado)}` : ''}</span>
                  )}
                  {tab === 'guia' && <span className="small">Salió el {fechaCorta(p.fecha_despacho)}</span>}
                  {alerta && <span className="alerta-txt"><AlertCircle size={12} /> {alerta.texto}</span>}
                </div>
              </div>
              <div className="acciones">
                {tab === 'preparar' && (
                  <>
                    {retiro.length > 0
                      ? <button className="btn btn-sm btn-dark" disabled={retirando === p.id} onClick={() => void loRetiro(p, retiro)}><HandCoins size={15} /> {retirando === p.id ? 'Guardando…' : 'Lo retiró'}</button>
                      : puede('despachado', p) && <button className="btn btn-sm btn-dark" onClick={() => setCambio({ pedidos: [p], a: 'despachado' })}><Truck size={15} /> Despachar</button>}
                    {puede('bloqueado', p) && <button className="btn btn-sm" onClick={() => setCambio({ pedidos: [p], a: 'bloqueado' })}>{p.estado === 'cargado' ? 'Sin stock / frenar' : 'Frenar'}</button>}
                    {p.estado === 'cargado' && impresion.puedeImprimir && <button className="btn btn-sm" disabled={impresion.trabajando} onClick={() => void impresion.imprimir([p])}><Printer size={15} /> Imprimir</button>}
                    <button className="btn btn-sm" onClick={() => void abrirRemito(p)}><FileText size={15} /> Remito</button>
                  </>
                )}
                {tab === 'frenados' && (
                  <>
                    {puede('cargado', p) && <button className="btn btn-sm btn-dark" onClick={() => void api.cambiarEstado(p.id, 'cargado').then(recargar).then(() => avisar('Destrabado: vuelve a la cola')).catch((err) => avisar(mensajeError(err), true))}>Destrabar</button>}
                    {puede('despachado', p) && <button className="btn btn-sm" onClick={() => setCambio({ pedidos: [p], a: 'despachado' })}><Truck size={15} /> Despachar</button>}
                  </>
                )}
                {tab === 'guia' && (
                  <>
                    <label className="btn btn-sm btn-dark" {...soltable((fs) => void subirGuia(p, fs[0]))}>
                      <Camera size={15} /> Guía (foto o PDF)
                      <input type="file" accept={ACEPTA_ARCHIVOS} hidden onChange={(ev) => { void subirGuia(p, ev.target.files?.[0]); ev.target.value = '' }} />
                    </label>
                    <a className="btn btn-sm" href={`#/p/${p.codigo}`}>Cargar N° de guía</a>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {seleccionados.length > 0 && accionLote && (
        <div className="bulk-bar">
          <b>{seleccionados.length} seleccionado{seleccionados.length === 1 ? '' : 's'}</b>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" style={{ color: '#fff' }} onClick={() => setSel(new Set())}>Quitar</button>
          <button className="btn btn-sm btn-primary" disabled={!loteOk}
            onClick={() => setCambio({ pedidos: seleccionados, a: 'despachado' })}>
            <Truck size={15} /> Marcar despachados
          </button>
        </div>
      )}

      {leerGuia.elemento}
      {subirGuias && <SubirGuias onClose={() => setSubirGuias(false)} />}
      {cambio && <CambioEstado pedidos={cambio.pedidos} a={cambio.a} onClose={() => setCambio(null)} onHecho={() => setSel(new Set())} />}
    </div>
  )
}

function VendedorNombre({ p }: { p: Pedido }) {
  const nombre = useNombre()
  return <>{nombre(p.vendedor_id, p.vendedor_email)}</>
}
