import { describe, expect, it } from 'vitest'
import { AVISO_SOLO_LECTURA, soloLectura } from './soloLectura'
import type { Api } from './api'

describe('modo prueba (solo lectura)', () => {
  it('deja leer y frena toda escritura', async () => {
    const base = {
      listarPedidos: async () => [{ id: '1' }],
      cambiarEstado: async () => { throw new Error('no debería llamarse') },
      subirArchivo: async () => { throw new Error('no debería llamarse') },
      editarPedido: async () => { throw new Error('no debería llamarse') },
    } as unknown as Api
    const api = soloLectura(base)
    expect(await api.listarPedidos()).toHaveLength(1)
    await expect(api.cambiarEstado('1', 'impreso')).rejects.toThrow(AVISO_SOLO_LECTURA)
    await expect(api.subirArchivo('1', 'guia', new File([''], 'g.pdf'))).rejects.toThrow(AVISO_SOLO_LECTURA)
    await expect(api.editarPedido('1', {})).rejects.toThrow(AVISO_SOLO_LECTURA)
  })
})
