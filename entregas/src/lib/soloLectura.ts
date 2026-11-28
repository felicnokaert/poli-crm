// Modo prueba de Poliplast App: se lee todo de verdad y cualquier escritura se frena (ver SOLO_LECTURA en cliente.ts).
import { ApiError, type Api } from './api'

export const AVISO_SOLO_LECTURA = 'Modo prueba: no se guarda.'
const ESCRITURAS = ['guardarExpreso', 'guardarConfig', 'asignarRol', 'crearPedido', 'cambiarEstado', 'editarPedido', 'comentar', 'subirArchivo', 'borrarArchivo', 'marcarPasoShopify'] as const

export function soloLectura(base: Api): Api {
  const frenada = { ...base } as Api
  for (const nombre of ESCRITURAS) {
    (frenada as unknown as Record<string, unknown>)[nombre] = () => Promise.reject(new ApiError(AVISO_SOLO_LECTURA))
  }
  return frenada
}

