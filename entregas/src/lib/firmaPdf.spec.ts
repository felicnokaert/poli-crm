import { describe, expect, it } from 'vitest'
import { buscarHueco } from './firmaPdf'

/** Hoja de prueba: blanca, con rectángulos «escritos» (negros). */
function hoja(ancho: number, alto: number, escritos: Array<[number, number, number, number]>) {
  const g = new Uint8Array(ancho * alto).fill(255)
  for (const [x, y, w, h] of escritos) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j * ancho + i] = 0
  return g
}

describe('buscarHueco (lugar en blanco para la firma)', () => {
  it('en una hoja vacía elige abajo a la derecha', () => {
    const h = buscarHueco(hoja(600, 800, []), 600, 800, 200, 90)!
    expect(h.y + h.h).toBeGreaterThan(800 * 0.9)
    expect(h.x + h.w).toBeGreaterThan(600 * 0.9)
  })
  it('no pisa nada escrito', () => {
    const escritos: Array<[number, number, number, number]> = [[0, 0, 600, 500], [0, 700, 600, 100]] // arriba lleno y pie lleno
    const g = hoja(600, 800, escritos)
    const h = buscarHueco(g, 600, 800, 200, 90)!
    expect(h).not.toBeNull()
    expect(h.y).toBeGreaterThanOrEqual(500)
    expect(h.y + h.h).toBeLessThanOrEqual(700)
  })
  it('si la hoja está llena devuelve null (va en hoja nueva)', () => {
    expect(buscarHueco(hoja(300, 300, [[0, 0, 300, 300]]), 300, 300, 100, 50)).toBeNull()
  })
  it('una mota suelta del escaneo no impide usar el lugar', () => {
    const g = hoja(400, 400, [[0, 0, 400, 200], [350, 330, 1, 1]])
    expect(buscarHueco(g, 400, 400, 200, 90)).not.toBeNull()
  })
  it('respeta el margen de la hoja', () => {
    const h = buscarHueco(hoja(500, 500, []), 500, 500, 100, 50)!
    expect(h.x + h.w).toBeLessThanOrEqual(500 - 20)
    expect(h.y + h.h).toBeLessThanOrEqual(500 - 20)
  })
})
