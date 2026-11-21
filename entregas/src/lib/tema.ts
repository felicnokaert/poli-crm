// Modo oscuro (21/11, Felipe: «Entregas no responde al modo noche»). Dentro del CRM, Entregas toma el tema del CRM:
// el CRM lo pasa en la dirección (?tema=dark|light, para no parpadear al abrir) y lo vuelve a mandar con
// { tipo: 'crm:tema', tema } cada vez que se cambia. Suelta (link directo) sigue al dispositivo por CSS.
import { isCrmOrigin, isEmbeddedInCrm } from './embed'

export type Tema = 'dark' | 'light'

export function temaValido(valor: unknown): Tema | null {
  return valor === 'dark' || valor === 'light' ? valor : null
}

export function aplicarTema(tema: Tema | null, root: HTMLElement = document.documentElement): void {
  if (tema) root.dataset.theme = tema
  else delete root.dataset.theme
}

/** Arranca el tema según el CRM y lo sigue. Devuelve la función para dejar de escuchar. */
export function seguirTemaDelCrm(win: Window = window): () => void {
  if (!isEmbeddedInCrm(win)) return () => {}
  try { aplicarTema(temaValido(new URLSearchParams(win.location.search).get('tema')), win.document.documentElement) } catch { /* sin dirección */ }
  const onMessage = (event: MessageEvent) => {
    if (!isCrmOrigin(event.origin) || event.source !== win.parent) return
    const data = event.data as { tipo?: string; tema?: string }
    if (data?.tipo !== 'crm:tema') return
    aplicarTema(temaValido(data.tema), win.document.documentElement)
  }
  win.addEventListener('message', onMessage)
  return () => win.removeEventListener('message', onMessage)
}
