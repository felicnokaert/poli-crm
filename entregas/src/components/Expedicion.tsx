// Pantalla de trabajo de expedición, pensada para el celular: qué preparar y despachar, qué está frenado y a
// qué le falta la guía. Los remitos nuevos se imprimen en tanda desde la barra de arriba (o solos, en la compu
// marcada): ya no hay un paso «Por imprimir» a mano. Permite marcar varios a la vez.
import { AlertCircle, Camera, FileText, FileUp, HandCoins, Monitor, PackageOpen, PenLine, Printer, Truck } from 'lucide-react'
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
import { AvisoCierre, BotonResumen } from './ResumenDia'
import { depositoActual, operadorActual } from '../lib/operador'
import { RelojLead } from './LeadTime'
import { SubirGuias } from './SubirGuias'
import { CON_IMPRIMIR, CON_SUBIR, CON_VER_ARCHIVOS, GUIA_LEIDA_AL_SUBIR, MODO_CONTEO } from '../lib/cliente' // en conteo: subir por la API del CRM (1b) e imprimir
import { listarSinAsignar, type ArchivoSinAsignar } from '../lib/expedicionApi'
import { SinAsignar } from './SinAsignar'
import { FirmaRemito } from './FirmaRemito'
import { FiltroDeposito, useFiltroDeposito } from './FiltroDeposito'
import { ACEPTA_ARCHIVOS, DepositoChip, Empty, EstadoChip, soltable, useToast } from './ui'

type Tab = 'preparar' | 'frenados' | 'guia' | 'sinasignar'

const TABS: { id: Tab; label: string }[] = [
  { id: 'preparar', label: 'Para despachar' },
  { id: 'frenados', label: 'Frenados' },
  { id: 'guia', label: 'Falta la guía' },
  ...(CON_SUBIR ? [{ id: 'sinasignar' as const, label: 'Sin asignar' }] : []), // PARCHE CONTEO
]

export function Expedicion() {
  const { yo, pedidos, expresosPorId, config, recargar, cargando, error } = useDatos()
  const avisar = useToast()
  const [tab, setTab] = useState<Tab>('preparar')
  const impresion = useImpresion()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [cambio, setCambio] = useState<{ pedidos: Pedido[]; a: Estado } | null>(null)
  const leerGuia = useLeerGuia(recargar)
  const [subirGuias, setSubirGuias] = useState(false)
  const [firmar, setFirmar] = useState<{ p: Pedido; pasos: Estado[] } | null>(null) // PARCHE CONTEO: firma digital al retirar
  // PARCHE CONTEO: archivos subidos que el CRM no pudo emparejar
  const [sinAsig, setSinAsig] = useState<{ archivos: ArchivoSinAsignar[]; cargando: boolean; error: string | null }>({ archivos: [], cargando: CON_SUBIR, error: null })
  async function cargarSinAsig() {
    if (!CON_SUBIR) return
    try { const archivos = await listarSinAsignar(); setSinAsig({ archivos, cargando: false, error: null }) } catch (e) { setSinAsig((x) => ({ ...x, cargando: false, error: mensajeError(e) })) }
  }
  useEffect(() => { void cargarSinAsig(); const t = setInterval(() => void cargarSinAsig(), 60000); return () => clearInterval(t) }, [])
  async function recargarTodo() { await Promise.all([recargar(), cargarSinAsig()]) }

  const [filtroDep, setFiltroDep, porDeposito] = useFiltroDeposito() // PARCHE CONTEO
  const grupos = useMemo(() => {
    const pedidosDep = porDeposito(pedidos)
    const porAntiguedad = (a: Pedido, b: Pedido) => a.created_at.localeCompare(b.created_at)
    return {
      preparar: pedidosDep.filter((p) => p.estado === 'impreso' || p.estado === 'cargado').sort(porAntiguedad),
      frenados: pedidosDep.filter((p) => p.estado === 'bloqueado').sort(porAntiguedad),
      guia: pedidosDep.filter((p) => faltantesDe(p, p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined).includes('guia'))
        .sort((a, b) => (b.fecha_despacho ?? '').localeCompare(a.fecha_despacho ?? '')),
      sinasignar: [] as Pedido[],
    } satisfies Record<Tab, Pedido[]>
  }, [pedidos, expresosPorId, filtroDep]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al entrar, abrir la primera pestaña que tenga trabajo.
  const elegida = useRef(false)
  useEffect(() => {
    if (cargando || elegida.current) return
    elegida.current = true
    const primera = TABS.find((t) => t.id !== 'sinasignar' && grupos[t.id].length > 0)
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
          {MODO_CONTEO && <a className="btn" href={`/entregas/?embed=app&modo=expedicion&persona=${encodeURIComponent(operadorActual() ?? '')}&deposito=${encodeURIComponent(depositoActual() ?? '')}#/pantalla`} target="_blank" rel="noreferrer"><Monitor size={15} /> Tablero del depósito</a>}
        </div>
      </div>

      <AvisoCierre /> {/* PARCHE CONTEO: el aviso de las 15:30 estaba en Inicio */}
      {error && <div className="aviso err" role="alert" style={{ marginBottom: 12 }}>{error} <button className="btn btn-sm" onClick={() => void recargar()}>Reintentar</button></div>} {/* PARCHE CONTEO */}
      {CON_IMPRIMIR && <BarraImpresion />}

      <FiltroDeposito valor={filtroDep} onChange={setFiltroDep} /> {/* PARCHE CONTEO */}
      <div className="exp-tabs" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {TABS.map((t) => (
          <button key={t.id} className="exp-tab" aria-pressed={tab === t.id} onClick={() => cambiarTab(t.id)}>
            <b className="num">{t.id === 'sinasignar' ? (sinAsig.cargando ? '·' : sinAsig.archivos.length) : cargando ? '·' : grupos[t.id].length}</b>
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
        {tab === 'sinasignar' ? <SinAsignar archivos={sinAsig.archivos} cargando={sinAsig.cargando} error={sinAsig.error} onCambio={recargarTodo} /> : cargando ? (
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
                  <span className="small muted"><span className="mono">{p.n_remito}</span> · {[p.localidad, p.provincia].filter(Boolean).length ? <>Destino: {[p.localidad, p.provincia].filter(Boolean).join(', ')} · </> : null}<VendedorNombre p={p} /></span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="chip tono-neutro"><Truck size={12} /> {e?.nombre ?? 'Sin expreso'}</span>
                    {p.deposito_salida && <span className="dep-sale">Sale de <DepositoChip deposito={p.deposito_salida} corto /></span>}
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
                      ? <>
                          <button className="btn btn-sm btn-primary" onClick={() => setFirmar({ p, pasos: retiro })}><PenLine size={15} /> Firma y retira</button>
                          <button className="btn btn-sm btn-dark" disabled={retirando === p.id} onClick={() => void loRetiro(p, retiro)}><HandCoins size={15} /> {retirando === p.id ? 'Guardando…' : 'Lo retiró'}</button>
                        </>
                      : puede('despachado', p) && <button className="btn btn-sm btn-dark" onClick={() => setCambio({ pedidos: [p], a: 'despachado' })}><Truck size={15} /> Despachar</button>}
                    {puede('bloqueado', p) && <button className="btn btn-sm" onClick={() => setCambio({ pedidos: [p], a: 'bloqueado' })}>{p.estado === 'cargado' ? 'Sin stock / frenar' : 'Frenar'}</button>}
                    {CON_IMPRIMIR && p.estado === 'cargado' && impresion.puedeImprimir && <button className="btn btn-sm" disabled={impresion.trabajando} onClick={() => void impresion.imprimir([p])}><Printer size={15} /> Imprimir</button>}
                    {CON_VER_ARCHIVOS && <button className="btn btn-sm" onClick={() => void abrirRemito(p)}><FileText size={15} /> Remito</button>}
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
                    {!GUIA_LEIDA_AL_SUBIR && <a className="btn btn-sm" href={`#/p/${p.codigo}`}>Cargar N° de guía</a>}
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
      {firmar && <FirmaRemito pedido={firmar.p} alFirmar={{ label: 'Marcar que lo retiró (queda entregado hoy)', hacer: () => marcarRetirado(api, firmar.p, firmar.pasos), retiro: true }} onClose={() => setFirmar(null)} onHecho={recargar} />}
      {subirGuias && <SubirGuias onClose={() => { setSubirGuias(false); void cargarSinAsig() }} />}
      {cambio && <CambioEstado pedidos={cambio.pedidos} a={cambio.a} onClose={() => setCambio(null)} onHecho={() => setSel(new Set())} />}
    </div>
  )
}

function VendedorNombre({ p }: { p: Pedido }) {
  const nombre = useNombre()
  return <>{nombre(p.vendedor_id, p.vendedor_email)}</>
}
