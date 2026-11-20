// Entregas adentro del CRM sin barra de desplazamiento propia (Felipe 20/11: «que sea parte del CRM, no un
// recuadro con su propia barra»). Contrato con EmbeddedAppFrame del CRM:
// - Entregas avisa su alto: { tipo: 'entregas:alto', alto } (cada vez que cambia el contenido).
// - El CRM pone el iframe de ese alto y contesta { tipo: 'crm:vista', top, alto } = la parte del iframe que se ve
//   en pantalla. Recién ahí se activa el modo `alto-auto` (un CRM viejo no contesta y todo sigue como antes).
// - Al cambiar de pantalla, { tipo: 'app:subir' } para que el CRM lleve la página al principio de Entregas.
// Las ventanas (.overlay), avisos (.toasts) y barras de abajo se ubican con --vista-top / --vista-alto.
import { isCrmOrigin, origenesCrm } from './embed'

function alCrm(mensaje: Record<string, unknown>): void {
  for (const origin of origenesCrm()) {
    try { window.parent.postMessage(mensaje, origin) } catch { /* otro origen */ }
  }
}

/** Arranca el alto automático. Devuelve la función para apagarlo. */
export function altoAutomaticoEnCrm(doc: Document = document): () => void {
  const html = doc.documentElement
  const contenido = doc.getElementById('root') ?? doc.body
  let ultimo = 0

  const avisar = () => {
    const alto = Math.ceil(contenido.getBoundingClientRect().height)
    if (alto <= 0 || alto === ultimo) return
    ultimo = alto
    alCrm({ tipo: 'entregas:alto', alto })
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(avisar) : null
  ro?.observe(contenido)
  avisar()

  const onMessage = (event: MessageEvent) => {
    if (!isCrmOrigin(event.origin) || event.source !== window.parent) return
    const d = event.data as { tipo?: string; top?: unknown; alto?: unknown }
    if (d?.tipo !== 'crm:vista') return
    const top = Math.max(0, Number(d.top) || 0)
    const alto = Math.max(160, Number(d.alto) || 0)
    html.classList.add('alto-auto')
    html.style.setProperty('--vista-top', `${top}px`)
    html.style.setProperty('--vista-alto', `${alto}px`)
  }
  const onHash = () => { if (html.classList.contains('alto-auto')) alCrm({ tipo: 'app:subir' }) }

  window.addEventListener('message', onMessage)
  window.addEventListener('hashchange', onHash)
  return () => {
    ro?.disconnect()
    window.removeEventListener('message', onMessage)
    window.removeEventListener('hashchange', onHash)
    html.classList.remove('alto-auto')
  }
}
