import { describe, expect, it } from 'vitest'
import { aplicarTema, temaValido } from './tema'

describe('tema del CRM', () => {
  it('solo acepta dark o light', () => {
    expect(temaValido('dark')).toBe('dark')
    expect(temaValido('light')).toBe('light')
    expect(temaValido('rojo')).toBeNull()
  })
  it('pone y saca data-theme', () => {
    const root = document.createElement('html')
    aplicarTema('dark', root)
    expect(root.dataset.theme).toBe('dark')
    aplicarTema(null, root)
    expect(root.dataset.theme).toBeUndefined()
  })
})
