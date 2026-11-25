import { useEffect, useState } from 'react'

export interface Ruta {
  pagina: 'inicio' | 'pantalla' | 'pedidos' | 'nuevo' | 'pedido' | 'expedicion' | 'calendario' | 'ajustes'
  param: string
  query: URLSearchParams
}

export function leerRuta(hash: string = window.location.hash): Ruta {
  const limpio = hash.replace(/^#\/?/, '')
  const [camino, qs = ''] = limpio.split('?')
  const partes = camino.split('/').filter(Boolean)
  const query = new URLSearchParams(qs)
  const p = partes[0] ?? ''
  if (p === 'p' && partes[1]) return { pagina: 'pedido', param: decodeURIComponent(partes[1]), query }
  if (p === 'pantalla') return { pagina: 'pantalla', param: '', query }
  if (p === 'pedidos' || p === 'nuevo' || p === 'expedicion' || p === 'calendario' || p === 'ajustes') return { pagina: p, param: '', query }
  return { pagina: 'inicio', param: '', query }
}

export function ir(destino: string) {
  const hash = destino.startsWith('#') ? destino : `#${destino.startsWith('/') ? '' : '/'}${destino}`
  if (window.location.hash !== hash) window.location.hash = hash
}

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState(() => leerRuta())
  useEffect(() => {
    const cambio = () => { setRuta(leerRuta()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', cambio)
    return () => window.removeEventListener('hashchange', cambio)
  }, [])
  return ruta
}
