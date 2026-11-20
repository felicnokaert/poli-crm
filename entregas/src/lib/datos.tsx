// Estado compartido de la app: usuario, catálogos (expresos, usuarios, config) y la lista de pedidos,
// que se recarga sola cuando alguien cambia algo (tiempo real).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mensajeError } from './api'
import { api } from './cliente'
import { CONFIG_DEFAULT, type Config, type Expreso, type Pedido, type Usuario } from './types'

interface Datos {
  yo: Usuario
  usuarios: Usuario[]
  usuariosPorId: Map<string, Usuario>
  expresos: Expreso[]
  expresosPorId: Map<string, Expreso>
  config: Config
  pedidos: Pedido[]
  cargando: boolean
  error: string | null
  /** Se incrementa con cada cambio remoto: las pantallas de detalle lo usan para recargarse. */
  version: number
  recargar: () => Promise<void>
  recargarCatalogos: () => Promise<void>
}

const Contexto = createContext<Datos | null>(null)

export function DatosProvider({ yo, children }: { yo: Usuario; children: ReactNode }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [expresos, setExpresos] = useState<Expreso[]>([])
  const [config, setConfig] = useState<Config>(CONFIG_DEFAULT)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const montado = useRef(true)

  const recargar = useCallback(async () => {
    try {
      const lista = await api.listarPedidos()
      if (!montado.current) return
      setPedidos(lista)
      setError(null)
    } catch (e) {
      if (montado.current) setError(mensajeError(e))
    } finally {
      if (montado.current) setCargando(false)
    }
  }, [])

  const recargarCatalogos = useCallback(async () => {
    try {
      const [u, x, c] = await Promise.all([api.listarUsuarios(), api.listarExpresos(), api.obtenerConfig()])
      if (!montado.current) return
      setUsuarios(u); setExpresos(x); setConfig(c)
    } catch (e) {
      if (montado.current) setError(mensajeError(e))
    }
  }, [])

  useEffect(() => {
    montado.current = true
    void recargarCatalogos()
    void recargar()
    const dejar = api.escuchar(() => {
      setVersion((v) => v + 1)
      void recargar()
    })
    // Por si el tiempo real se corta (notebook que se suspende), refresca al volver a la pestaña.
    const alVolver = () => { if (document.visibilityState === 'visible') { setVersion((v) => v + 1); void recargar() } }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      montado.current = false
      dejar()
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [recargar, recargarCatalogos])

  const valor = useMemo<Datos>(() => ({
    yo,
    usuarios,
    usuariosPorId: new Map(usuarios.map((u) => [u.id, u])),
    expresos,
    expresosPorId: new Map(expresos.map((e) => [e.id, e])),
    config,
    pedidos,
    cargando,
    error,
    version,
    recargar: async () => { setVersion((v) => v + 1); await recargar() },
    recargarCatalogos,
  }), [yo, usuarios, expresos, config, pedidos, cargando, error, version, recargar, recargarCatalogos])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useDatos(): Datos {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useDatos fuera de DatosProvider')
  return ctx
}

/** Nombre corto para mostrar a una persona por id o email (o la persona de expedición, si usó la cuenta compartida). */
export function useNombre() {
  const { usuariosPorId, usuarios } = useDatos()
  return useCallback((id: string | null | undefined, email?: string | null, operador?: string | null) => {
    if (operador) return `${operador} (expedición)`
    if (id && usuariosPorId.has(id)) return usuariosPorId.get(id)!.nombre
    if (email) {
      const u = usuarios.find((x) => x.email === email.toLowerCase())
      if (u) return u.nombre
      return email.split('@')[0].replace(/^\w/, (c) => c.toUpperCase())
    }
    return '—'
  }, [usuariosPorId, usuarios])
}
