import { describe, expect, it } from 'vitest'
import { armarEtq, limite } from './etiquetasTablero'

const ahora = new Date('2026-11-25T10:00:00').getTime()
const iso = (h: number) => new Date(ahora + h * 3600000).toISOString()

describe('etiquetas del tablero', () => {
  it('saca lo ya escaneado, Full y cancelados; ordena por hora límite', () => {
    const d = armarEtq([
      { id: '1', dispatch_by: iso(5) }, { id: '2', dispatch_by: iso(-1) }, { id: '3', dispatch_by: iso(1) },
      { id: '4', full: true }, { id: '5', cancelled: true }, { id: '6', dispatch_by: iso(2.5) },
    ], [{ envio: '6', creado: new Date(ahora - 3600000).toISOString() }, { envio: '99', creado: new Date(ahora - 30 * 3600000).toISOString() }], ahora)
    expect(d.pendientes.map((s) => s.id)).toEqual(['2', '3', '1'])
    expect(d.vencidas).toBe(1)
    expect(d.urgentes).toBe(1)
    expect(d.escaneadasHoy).toBe(1) // el de ayer no cuenta
  })
  it('sin fecha límite va al final', () => {
    expect(armarEtq([{ id: 'a' }, { id: 'b', dispatch_by: iso(3) }], [], ahora).pendientes.map((s) => s.id)).toEqual(['b', 'a'])
    expect(limite(null, ahora)).toBeNull()
  })
})
