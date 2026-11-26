import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ajustes } from './components/Ajustes'
import { Calendario } from './components/Calendario'
import { Expedicion } from './components/Expedicion'
import { ImpresionProvider } from './components/Impresion'
import { Inicio } from './components/Inicio'
import { Pantalla } from './components/Pantalla' // PARCHE CONTEO
import { Layout } from './components/Layout'
import { Login } from './components/Login'
import { NuevoRemito } from './components/NuevoRemito'
import { PedidoDetalle } from './components/PedidoDetalle'
import { Pedidos } from './components/Pedidos'
import { QuienSos } from './components/QuienSos'
import { ToastProvider } from './components/ui'
import { mensajeError, SinAcceso } from './lib/api'
import { api } from './lib/cliente'
import { DatosProvider } from './lib/datos'
import { altoAutomaticoEnCrm } from './lib/altoCrm'
import { avisarSinSesionAlCrm, avisarVisibleAlCrm, enMarcoPoliplast, escucharSesionDelCrm, isEmbeddedInApp, isEmbeddedInCrm } from './lib/embed'
import { alCambiarOperador, depositoActual, operadorActual, tomarPersonaDeLaUrl } from './lib/operador'
import { useRuta } from './lib/ruta'
import { camaraPendiente } from './lib/camaraPendiente'
import type { Usuario } from './lib/types'

type Sesion = { estado: 'cargando' } | { estado: 'fuera' } | { estado: 'sin_acceso'; email: string } | { estado: 'dentro'; yo: Usuario }

export default function App() {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'cargando' })
  const [error, setError] = useState<string | null>(null)
  const [operador, setOperadorEstado] = useState(operadorActual())
  // El depósito también avisa por acá: se fuerza a redibujar aunque la persona sea la misma.
  const [, setCambios] = useState(0)
  useEffect(() => alCambiarOperador(() => { setOperadorEstado(operadorActual()); setCambios((n) => n + 1) }), [])

  const comprobar = useCallback(async () => {
    try {
      const yo = await api.usuarioActual()
      if (yo) { setSesion({ estado: 'dentro', yo }); return }
      setSesion({ estado: 'fuera' })
    } catch (e) {
      if (e instanceof SinAcceso) { setSesion({ estado: 'sin_acceso', email: e.email }); return }
      setError(mensajeError(e))
      setSesion({ estado: 'fuera' })
    }
  }, [])

  useEffect(() => {
    // Pestaña del CRM: espera la sesión del CRM (y sus renovaciones). Si no llega en unos segundos, login normal.
    if (isEmbeddedInCrm()) {
      document.documentElement.classList.add('embebido')
      let recibida = false
      const dejar = escucharSesionDelCrm((access, refresh) => {
        recibida = true
        void api.recibirSesion?.(access, refresh).then(comprobar).catch(() => avisarSinSesionAlCrm())
      })
      const t = window.setTimeout(() => { if (!recibida) avisarSinSesionAlCrm() }, 5000)
      const dejarAlto = altoAutomaticoEnCrm()
      // Si la sesión del CRM no llegó y se entra con el login propio, también hay que enterarse.
      const dejarCambios = api.alCambiarSesion(() => void comprobar())
      return () => { dejar(); dejarAlto(); dejarCambios(); window.clearTimeout(t) }
    }
    // Sección de la app de conteo: se ve integrada y arranca en Expedición; el login es el propio.
    if (isEmbeddedInApp()) {
      // En Poliplast App (marco) no lleva el aspecto de la app de conteo: toma el diseño y el tema de la app que la contiene.
      document.documentElement.classList.add('embebido', enMarcoPoliplast() ? 'marco-poliplast' : 'en-app')
      tomarPersonaDeLaUrl()
      if (!window.location.hash || window.location.hash === '#/') window.history.replaceState(null, '', '#/expedicion')
    }
    // Si la página se recargó con la cámara abierta (Android), volver al pedido donde se estaba sacando la foto.
    const pendiente = camaraPendiente()
    if (pendiente && window.location.hash !== `#/p/${pendiente.codigo}`) window.location.hash = `#/p/${pendiente.codigo}`
    // Pantalla de Poliplast App (marco=poliplast): sin barra propia, alto automático y tema del padre (mismo origen).
    let dejarAltoMarco = () => {}
    if (enMarcoPoliplast()) {
      dejarAltoMarco = altoAutomaticoEnCrm()
    }
    void comprobar()
    const dejarSesion = api.alCambiarSesion(() => void comprobar())
    return () => { dejarSesion(); dejarAltoMarco() }
  }, [comprobar])

  // Dentro del CRM: avisar que ya se ve la pantalla, así el CRM saca su P de carga.
  useEffect(() => { if (sesion.estado === 'dentro' || sesion.estado === 'sin_acceso') avisarVisibleAlCrm() }, [sesion.estado])

  // En la cuenta compartida de expedición, la persona que usa el dispositivo pasa a ser "yo".
  const yo = useMemo(() => {
    if (sesion.estado !== 'dentro') return null
    const u = sesion.yo
    return u.compartida && operador ? { ...u, nombre: operador, operador } : u
  }, [sesion, operador])

  // Dentro del CRM, mientras arranca se ve la P del CRM (encima): acá no se muestra nada. Suelta o en la app de conteo, la P propia.
  if (sesion.estado === 'cargando') return isEmbeddedInCrm() || enMarcoPoliplast()
    ? <div className="centrado" />
    : <div className="centrado cargando-p" role="status" aria-label="Cargando"><span className="anillo" /><img src={`${import.meta.env.BASE_URL}poliplast-isotipo-color.png`} alt="" /></div>
  if (sesion.estado === 'sin_acceso') return <Login sinAcceso={sesion.email || 'actual'} onSalir={() => void api.cerrarSesion()} />
  // Dentro del CRM nunca se pide usuario y contraseña (25/11, Felipe: «Entregas es parte del CRM»): si la sesión no sirve,
  // se le avisa al CRM, que la renueva (y la reenvía) o muestra su propio ingreso.
  if (sesion.estado === 'fuera' && isEmbeddedInCrm()) return <div className="centrado" />
  if (sesion.estado === 'fuera') return (
    <>
      {error && <div className="aviso err" style={{ margin: 16 }}>{error}</div>}
      <Login />
    </>
  )

  if (!yo) return null
  // La cuenta compartida necesita la persona y el depósito de este dispositivo.
  if (yo.compartida && (!yo.operador || !depositoActual())) return <QuienSos />

  return (
    <ToastProvider>
      <DatosProvider yo={yo}>
        <ImpresionProvider>
          <Rutas />
        </ImpresionProvider>
      </DatosProvider>
    </ToastProvider>
  )
}

function Rutas() {
  const ruta = useRuta()
  let pagina
  if (ruta.pagina === 'pantalla') return <Pantalla /> // PARCHE CONTEO: pantalla grande para el monitor del depósito (sin menú)
  switch (ruta.pagina) {
    case 'pedidos': pagina = <Pedidos query={ruta.query} />; break
    case 'nuevo': pagina = <NuevoRemito />; break
    case 'pedido': pagina = <PedidoDetalle key={ruta.param} idOCodigo={ruta.param} />; break
    case 'expedicion': pagina = <Expedicion />; break
    case 'calendario': pagina = <Calendario />; break
    case 'ajustes': pagina = <Ajustes />; break
    default: pagina = isEmbeddedInApp() ? <Expedicion /> : <Inicio /> // PARCHE CONTEO: expedición no usa Inicio
  }
  return <Layout ruta={ruta}>{pagina}</Layout>
}
