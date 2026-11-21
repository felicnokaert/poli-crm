// Remitos de prueba con el formato de Contabilium (test-fixtures/remitos, ver generar.mjs): se lee el texto como lo hace la app
// y se verifica que se encuentra el «Recibí conforme____» donde lo ponen los remitos reales.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { anclaRecibi, type ItemTexto } from './firmaPdf'

async function itemsUltimaHoja(archivo: string): Promise<{ hojas: number; items: ItemTexto[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/remitos', archivo)))
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise
  const pag = await doc.getPage(doc.numPages)
  return { hojas: doc.numPages, items: (await pag.getTextContent()).items as unknown as ItemTexto[] }
}

describe('remitos tipo Contabilium (formato real, datos de prueba)', () => {
  for (const archivo of ['contabilium-1-item.pdf', 'contabilium-varios.pdf', 'contabilium-2-hojas.pdf']) {
    it(`${archivo}: encuentra «Recibí conforme» abajo a la derecha`, async () => {
      const { items } = await itemsUltimaHoja(archivo)
      const a = anclaRecibi(items)!
      expect(a).not.toBeNull()
      expect(a.x).toBeCloseTo(353, 0)
      expect(a.base).toBeCloseTo(46.6, 1)
      expect(a.xRaya).toBeGreaterThan(420) // la raya empieza después del texto en negrita
      expect(a.xRaya).toBeLessThan(445)
      expect(a.xFin).toBeCloseTo(570, 0)
    })
  }
  it('contabilium-2-hojas.pdf: el «Recibí conforme» está en la última hoja', async () => {
    const { hojas } = await itemsUltimaHoja('contabilium-2-hojas.pdf')
    expect(hojas).toBe(2)
  })
  it('sin-recibi.pdf: no hay «Recibí conforme» (se usa un lugar en blanco)', async () => {
    const { items } = await itemsUltimaHoja('sin-recibi.pdf')
    expect(anclaRecibi(items)).toBeNull()
  })
})
