// TABLERO DEL DEPÓSITO (PARCHE CONTEO): vista para un monitor o TV fijo en el depósito. Solo mira, no se toca nada: lo que hay para despachar
// (lo más viejo primero), lo frenado y los problemas, con letra grande. Se actualiza sola cada 45 segundos. Muestra el depósito de este equipo
// (agregá ?todos=1 para ver todos).
// PARCHE CONTEO (25/11, Felipe): más chico y con ETIQUETAS de Mercado Libre (pendientes por hora límite y escaneadas hoy), todo cada 45 s.
import { Maximize2, Minimize2, ArrowLeft, Moon, Sun } from 'lucide-react'
import './pantalla.css'
import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/datos'
import { depositoActual } from '../lib/operador'
import { MOTIVOS_BLOQUEO, MOTIVOS_INCIDENCIA } from '../lib/estados'
import { hoyISO } from '../lib/fechas'
import type { Pedido } from '../lib/types'
import { cargarEtq, limite, tipoEnvio, type DatosEtq } from '../lib/etiquetasTablero'

const hace = (iso: string, ahora: number) => { const h = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 3600000)); return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d` }
const horas = (iso: string, ahora: number) => (ahora - new Date(iso).getTime()) / 3600000

export function Pantalla() {
  const { pedidos, expresosPorId, error, cargando } = useDatos()
  const [ahora, setAhora] = useState(() => Date.now())
  const [full, setFull] = useState(false)
  const [claro, setClaro] = useState(() => { try { return localStorage.getItem('tablero-claro') === '1' } catch { return false } })
  const alternarTema = () => setClaro((v) => { const n = !v; try { localStorage.setItem('tablero-claro', n ? '1' : '0') } catch { /* sin storage */ } return n })
  const todos = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('todos') === '1'
  const dep = depositoActual()
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t) }, [])
  // Etiquetas: se consulta al entrar y cada 45 s (lo mismo que la pestaña Etiquetas)
  const [etq, setEtq] = useState<DatosEtq | null>(null)
  const [etqError, setEtqError] = useState('')
  useEffect(() => {
    let vivo = true
    const traer = () => cargarEtq().then((d) => { if (vivo) { setEtq(d); setEtqError('') } }).catch((e) => { if (vivo) setEtqError(String((e as Error).message || e)) })
    traer(); const t = setInterval(traer, 45000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])

  const mios = useMemo(() => pedidos.filter((p) => todos || !dep || !p.deposito_salida || p.deposito_salida === dep), [pedidos, dep, todos])
  const hoy = hoyISO(new Date(ahora))
  const para = useMemo(() => mios.filter((p) => p.estado === 'cargado' || p.estado === 'impreso').sort((a, b) => a.estado_desde.localeCompare(b.estado_desde)), [mios])
  const frenados = mios.filter((p) => p.estado === 'bloqueado')
  const problemas = mios.filter((p) => p.estado === 'incidencia')
  const salieron = mios.filter((p) => p.fecha_despacho === hoy && ['despachado', 'entregado', 'incidencia'].includes(p.estado)).length
  const nombreExp = (p: Pedido) => (p.expreso_id ? expresosPorId.get(p.expreso_id)?.nombre : '') || ''
  const viejo = (p: Pedido) => horas(p.estado_desde, ahora) > 48

  async function pantallaCompleta() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { /* no disponible */ }
  }
  const reloj = new Date(ahora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const fecha = new Date(ahora).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={'pantalla' + (claro ? ' clara' : '')}>
      <header className="pantalla-top">
        <a className="pantalla-volver" href="#/expedicion" aria-label="Volver"><ArrowLeft size={22} /></a>
        <div><div className="pantalla-dep">{todos || !dep ? 'Todos los depósitos' : dep}</div><div className="pantalla-fecha">{fecha}</div></div>
        <div className="pantalla-reloj">{reloj}</div>
        <button className="pantalla-fs" onClick={alternarTema} aria-label={claro ? 'Modo oscuro' : 'Modo claro'}>{claro ? <Moon size={22} /> : <Sun size={22} />}</button>
        <button className="pantalla-fs" onClick={() => void pantallaCompleta()} aria-label="Pantalla completa">{full ? <Minimize2 size={22} /> : <Maximize2 size={22} />}</button>
      </header>
      {error && <div className="pantalla-error">{error}</div>}
      <div className="pantalla-cifras">
        <div className="verde"><b>{cargando ? '·' : salieron}</b><span>Salieron hoy</span></div>
        <div className={para.length ? 'rojo' : 'verde'}><b>{cargando ? '·' : para.length}</b><span>Para despachar</span></div>
        <div className={frenados.length ? 'ambar' : 'verde'}><b>{cargando ? '·' : frenados.length}</b><span>Frenados</span></div>
        <div className={problemas.length ? 'rojo' : 'verde'}><b>{cargando ? '·' : problemas.length}</b><span>Con problema</span></div>
        <div className={etq && etq.vencidas ? 'rojo' : etq && etq.pendientes.length ? 'ambar' : 'verde'}><b>{etq ? etq.pendientes.length : '·'}</b><span>Etiquetas por despachar</span></div>
        <div className="verde"><b>{etq ? etq.escaneadasHoy : '·'}</b><span>Etiquetas escaneadas hoy</span></div>
      </div>
      <div className="pantalla-cols">
        <section>
          <h2>Para despachar <small>lo más viejo primero</small></h2>
          {!para.length && <p className="pantalla-vacio">✅ No hay nada pendiente</p>}
          {para.slice(0, 12).map((p) => (
            <div key={p.id} className={'pantalla-fila' + (viejo(p) ? ' viejo' : '')}>
              <div className="cli">{p.cliente}</div>
              <div className="det">{[nombreExp(p), p.localidad].filter(Boolean).join(' · ')}</div>
              <div className="hace">{hace(p.estado_desde, ahora)}</div>
            </div>
          ))}
          {para.length > 12 && <p className="pantalla-mas">y {para.length - 12} más…</p>}
        </section>
        <section>
          <h2>Frenados <small>por qué no salen</small></h2>
          {!frenados.length && <p className="pantalla-vacio">✅ Ninguno</p>}
          {frenados.slice(0, 8).map((p) => (
            <div key={p.id} className="pantalla-fila ambar">
              <div className="cli">{p.cliente}</div>
              <div className="det">{(p.bloqueo_motivo && MOTIVOS_BLOQUEO[p.bloqueo_motivo]?.label) || 'Sin motivo'}{p.stock_estimado ? ` · stock ${p.stock_estimado.slice(8, 10)}/${p.stock_estimado.slice(5, 7)}` : ''}</div>
              <div className="hace">{hace(p.estado_desde, ahora)}</div>
            </div>
          ))}
          <h2 style={{ marginTop: 26 }}>Con problema</h2>
          {!problemas.length && <p className="pantalla-vacio">✅ Ninguno</p>}
          {problemas.slice(0, 6).map((p) => (
            <div key={p.id} className="pantalla-fila viejo">
              <div className="cli">{p.cliente}</div>
              <div className="det">{(p.incidencia_motivo && MOTIVOS_INCIDENCIA[p.incidencia_motivo]?.label) || 'Problema en el envío'}</div>
              <div className="hace">{hace(p.estado_desde, ahora)}</div>
            </div>
          ))}
        </section>
        <section>
          <h2>Etiquetas ML <small>por hora límite</small></h2>
          {etqError && <p className="pantalla-mas">{etqError}</p>}
          {etq && !etq.pendientes.length && <p className="pantalla-vacio">✅ Todo escaneado</p>}
          {etq && etq.vencidas > 0 && <p className="pantalla-alerta">⏰ {etq.vencidas} vencida{etq.vencidas === 1 ? '' : 's'}: despachalas primero</p>}
          {etq && etq.pendientes.slice(0, 10).map((s) => {
            const l = limite(s.dispatch_by, ahora)
            return (
              <div key={s.id} className={'pantalla-fila' + (l?.nivel === 'vencido' ? ' viejo' : l?.nivel === 'urgente' ? ' ambar' : '')}>
                <div className="cli">{(s.lines || []).map((x) => `${x.sku || 'SIN SKU'} × ${x.qty ?? 1}`).join(' · ') || s.id}</div>
                <div className="det">{[tipoEnvio(s.logistic_type), s.account].filter(Boolean).join(' · ')}</div>
                <div className="hace">{l ? l.txt.replace('hoy ', '') : ''}</div>
              </div>
            )
          })}
          {etq && etq.pendientes.length > 10 && <p className="pantalla-mas">y {etq.pendientes.length - 10} más…</p>}
        </section>
      </div>
    </div>
  )
}
