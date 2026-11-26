import { BookOpen, CalendarDays, ClipboardList, Home, LogOut, Plus, Settings, UserRound, Warehouse } from 'lucide-react'
import { MODO_CONTEO, SOLO_LECTURA } from '../lib/cliente'

/** Guía de uso (21/11): la del CRM para comerciales; en la app de conteo, la de expedición. */
export const GUIA_URL = MODO_CONTEO ? 'https://poliplast-conteo-stock.netlify.app/guia/' : 'https://poli-crm.vercel.app/guia/#entregas'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, MAQUETA } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { alertaDe, ROL_LABEL } from '../lib/estados'
import { alCambiarOperador, depositoActual, setDeposito, setOperador } from '../lib/operador'
import type { Ruta } from '../lib/ruta'

export function Layout({ ruta, children }: { ruta: Ruta; children: ReactNode }) {
  const { yo, pedidos, expresosPorId, config } = useDatos()
  const conteos = useMemo(() => {
    let atencion = 0
    let atencionMios = 0
    let colaExp = 0
    for (const p of pedidos) {
      const a = alertaDe(p, p.expreso_id ? expresosPorId.get(p.expreso_id) : undefined, config)
      if (a) { atencion += 1; if (p.vendedor_id === yo.id) atencionMios += 1 }
      if (p.estado === 'cargado' || p.estado === 'impreso') colaExp += 1
    }
    return { atencion, atencionMios, colaExp }
  }, [pedidos, expresosPorId, config, yo.id])

  const esVendedor = yo.rol === 'vendedor'
  const badgePedidos = esVendedor ? conteos.atencionMios : conteos.atencion
  const actual = (p: Ruta['pagina'] | Ruta['pagina'][]) => ((Array.isArray(p) ? p : [p]).includes(ruta.pagina) ? 'page' : undefined)

  const links: { href: string; label: string; icono: ReactNode; pagina: Ruta['pagina'][]; badge?: number; hot?: boolean }[] = [
    { href: '#/', label: 'Inicio', icono: <Home size={17} />, pagina: ['inicio'] },
    { href: '#/pedidos', label: 'Pedidos', icono: <ClipboardList size={17} />, pagina: ['pedidos', 'pedido'], badge: badgePedidos, hot: badgePedidos > 0 },
    { href: '#/expedicion', label: 'Expedición hoy', icono: <Warehouse size={17} />, pagina: ['expedicion'], badge: conteos.colaExp },
    { href: '#/calendario', label: 'Calendario', icono: <CalendarDays size={17} />, pagina: ['calendario'] },
  ]
  if (yo.rol === 'admin') links.push({ href: '#/ajustes', label: 'Ajustes', icono: <Settings size={17} />, pagina: ['ajustes'] })

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}poliplast-isotipo-blanco.png`} alt="" />
          <div>
            <b>Entregas</b>
            <span>Grupo Poliplast</span>
          </div>
        </div>
        <a className="btn btn-primary nav-cta" href="#/nuevo"><Plus size={16} /> Cargar remito</a>
        <nav className="nav" aria-label="Secciones">
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={actual(l.pagina)}>
              {l.icono} {l.label}
              {Boolean(l.badge) && <span className={`nav-badge${l.hot ? ' hot' : ''}`}>{l.badge}</span>}
            </a>
          ))}
          <a className="nav-guia" href={GUIA_URL} target="_blank" rel="noreferrer"><BookOpen size={16} /> Guía</a>
        </nav>
        <div className="sidebar-foot">
          <div>
            <div className="who">{yo.nombre}</div>
            <div className="role">{ROL_LABEL[yo.rol]}{MAQUETA ? ' · maqueta' : ''}</div>
            <SelectorDeposito />
            <a className="link-btn" href={GUIA_URL} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, marginTop: 6 }}><BookOpen size={13} /> Guía</a>
          </div>
          {yo.compartida
            ? <button className="link-btn" onClick={() => setOperador(null)}><UserRound size={13} /> No soy {yo.nombre}</button>
            : <button className="link-btn" onClick={() => void api.cerrarSesion()}><LogOut size={13} /> Cerrar sesión</button>}
        </div>
      </aside>

      <header className="mobile-top">
        <img src={`${import.meta.env.BASE_URL}poliplast-isotipo-blanco.png`} alt="" />
        <b>Entregas</b>
        <span className="spacer" />
        <a href={GUIA_URL} target="_blank" rel="noreferrer" aria-label="Guía de uso" style={{ color: '#c7c7c9', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginRight: 10 }}><BookOpen size={18} /> Guía</a>
        {yo.rol === 'admin' && <a href="#/ajustes" aria-label="Ajustes" style={{ color: '#c7c7c9' }}><Settings size={19} /></a>}
        {yo.compartida
          ? <button className="link-btn" onClick={() => setOperador(null)} aria-label="Cambiar de persona o depósito"><UserRound size={16} /> {yo.nombre}{depositoActual() ? ` · ${depositoActual()}` : ''}</button>
          : <button className="link-btn" onClick={() => void api.cerrarSesion()} aria-label="Cerrar sesión"><LogOut size={18} /></button>}
      </header>

      <main className="main">{SOLO_LECTURA && <div className="aviso warn modo-prueba" role="status">Modo prueba: ves los datos reales, pero nada de lo que toques se guarda.</div>}{children}</main>

      <nav className="bottom-nav" aria-label="Secciones">
        <a href="#/" aria-current={actual('inicio')}><Home size={20} /> Inicio</a>
        <a href="#/pedidos" aria-current={actual(['pedidos', 'pedido'])}>
          <ClipboardList size={20} /> Pedidos
          {badgePedidos > 0 && <span className="dot-badge">{badgePedidos}</span>}
        </a>
        <a href="#/nuevo" className="nuevo" aria-current={actual('nuevo')}><span className="ico"><Plus size={20} /></span> Cargar</a>
        <a href="#/expedicion" aria-current={actual('expedicion')}>
          <Warehouse size={20} /> Expedición
          {conteos.colaExp > 0 && <span className="dot-badge">{conteos.colaExp}</span>}
        </a>
        <a href="#/calendario" aria-current={actual('calendario')}><CalendarDays size={20} /> Calendario</a>
      </nav>
    </div>
  )
}

/** Depósito desde donde trabaja este dispositivo (queda en cada paso que se marca). Expedición y administradores. */
function SelectorDeposito() {
  const { yo, config } = useDatos()
  const [, refrescar] = useState(0)
  useEffect(() => alCambiarOperador(() => refrescar((n) => n + 1)), [])
  if (yo.rol === 'vendedor' || !config.depositos?.length) return null
  const actual = depositoActual()
  if (yo.compartida) return actual ? <div className="role"><Warehouse size={12} /> {actual}</div> : null
  return (
    <label className="role" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Warehouse size={12} />
      <select className="deposito-select" value={actual ?? ''} onChange={(e) => setDeposito(e.target.value || null)} aria-label="Depósito de este dispositivo">
        <option value="">Sin depósito</option>
        {config.depositos.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
  )
}
