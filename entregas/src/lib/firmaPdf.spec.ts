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

import { anclaRecibi, tintaOscura } from './firmaPdf'

describe('anclaRecibi («Recibí conforme ____» del remito)', () => {
  const it_ = (str: string, x: number, y: number, w: number) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, height: 10 })
  it('Contabilium: texto y raya juntos', () => {
    const a = anclaRecibi([it_('Cantidad total: 2', 27, 172, 72), it_('Recibí conforme_________________________', 353, 46.6, 217)])!
    expect(a.x).toBe(353)
    expect(a.base).toBe(46.6)
    expect(a.xFin).toBe(570)
    expect(a.xRaya).toBeGreaterThan(400) // la raya empieza después de «Recibí conforme»
    expect(a.xRaya).toBeLessThan(450)
  })
  it('raya como texto aparte', () => {
    const a = anclaRecibi([it_('Recibí conforme:', 300, 60, 80), it_('______________', 385, 60.5, 150)])!
    expect(a.xRaya).toBe(385)
    expect(a.xFin).toBe(535)
  })
  it('sin «Recibí conforme» → null (se busca un lugar en blanco)', () => {
    expect(anclaRecibi([it_('Transporte: Retira el cliente', 40, 395, 150)])).toBeNull()
  })
})

describe('tintaOscura', () => {
  it('el fondo gris no cuenta, el texto sí', () => {
    const g = new Uint8Array(100 * 100).fill(240) // fondo gris claro
    expect(tintaOscura(g, 100, 100, 0, 0, 100, 100)).toBe(0)
    g[50 * 100 + 50] = 20
    expect(tintaOscura(g, 100, 100, 40, 40, 20, 20)).toBe(1)
    expect(tintaOscura(g, 100, 100, 0, 0, 30, 30)).toBe(0)
  })
})
