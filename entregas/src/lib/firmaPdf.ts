// Idea de Felipe (21/11; mismo código en la app de conteo): la firma digital se ESTAMPA en el PDF del remito, en un lugar en blanco de la hoja,
// con la aclaración, el DNI, la fecha y quién entregó. Así el «remito firmado» es el mismo remito con la firma encima.
// Si en ninguna hoja hay lugar libre, se agrega una hoja al final con la firma (nunca se tapa nada escrito).
import type { DatosConstancia } from './firma'
import { dniLegible } from './firma'

/** Rectángulo en píxeles de la imagen de la hoja (origen arriba a la izquierda). */
export interface Hueco { x: number; y: number; w: number; h: number }

/**
 * Busca un rectángulo libre de tinta de w×h dentro de una hoja dibujada (en escala de grises: 0 negro, 255 blanco).
 * Prefiere el más bajo de la hoja (donde suele ir «recibí conforme») y, a igual altura, el de la derecha.
 * Deja un margen de la hoja sin usar. Devuelve null si no hay ninguno.
 */
export function buscarHueco(gris: Uint8Array | Uint8ClampedArray, ancho: number, alto: number, w: number, h: number, margen = 0.04, blanco = 246): Hueco | null {
  if (w > ancho || h > alto) return null
  // tabla de sumas de «tinta» (1 si el píxel no es casi blanco) para contar rápido cualquier rectángulo
  const W = ancho + 1
  const suma = new Uint32Array(W * (alto + 1))
  for (let y = 0; y < alto; y++) {
    let fila = 0
    for (let x = 0; x < ancho; x++) {
      fila += gris[y * ancho + x] < blanco ? 1 : 0 // 21/11: el gris claro (fondos, letra chica de Contabilium) también cuenta como ocupado
      suma[(y + 1) * W + (x + 1)] = suma[y * W + (x + 1)] + fila
    }
  }
  const tinta = (x: number, y: number) => suma[(y + h) * W + (x + w)] - suma[y * W + (x + w)] - suma[(y + h) * W + x] + suma[y * W + x]
  const mx = Math.round(ancho * margen); const my = Math.round(alto * margen)
  const paso = Math.max(2, Math.round(Math.min(w, h) / 12))
  const tolerancia = Math.round(w * h * 0.0002) // casi nada: antes 0,15 % dejaba pisar letras chicas
  for (let y = alto - my - h; y >= my; y -= paso) {
    for (let x = ancho - mx - w; x >= mx; x -= paso) {
      if (tinta(x, y) <= tolerancia) return { x, y, w, h }
    }
  }
  return null
}

/** Recorta el lienzo de la firma a lo dibujado (con un poco de aire). Devuelve PNG transparente. */
async function firmaRecortada(lienzo: HTMLCanvasElement): Promise<{ png: Uint8Array; w: number; h: number }> {
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Este navegador no puede leer la firma.')
  const { width: W, height: H } = lienzo
  const px = ctx.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) throw new Error('Falta la firma.')
  const aire = 8
  x0 = Math.max(0, x0 - aire); y0 = Math.max(0, y0 - aire); x1 = Math.min(W - 1, x1 + aire); y1 = Math.min(H - 1, y1 + aire)
  const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1
  c.getContext('2d')!.drawImage(lienzo, x0, y0, c.width, c.height, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la firma.'))), 'image/png'))
  return { png: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height }
}

const fechaHoraAr = (d: Date) => d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
/** Las letras estándar del PDF (Helvetica) no tienen todo: se cambia lo raro por algo parecido. */
const seguro = (s: string) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E -ÿ·–—…]/g, '')

/** Renglones del sello (debajo de la firma). */
export function lineasSello(d: DatosConstancia): string[] {
  return [
    `${d.modo === 'retiro' ? 'Retiró' : 'Recibió'} conforme · ${fechaHoraAr(d.momento)}`,
    `Aclaración: ${d.nombre}`,
    `DNI: ${dniLegible(d.dni)}`,
    `Entregó: ${d.entrego}${d.deposito ? ` · ${d.deposito}` : ''}`,
  ].map(seguro)
}

export interface ResultadoSello { pdf: Uint8Array; pagina: number; hojaNueva: boolean; vista: string }

/**
 * Estampa la firma en el remito. Busca lugar en la última hoja, después en las anteriores; si no hay, agrega una hoja.
 * Devuelve el PDF nuevo y una imagen de la hoja firmada para mostrar antes de guardar.
 */
export async function estamparFirma(remito: Uint8Array, lienzo: HTMLCanvasElement, datos: DatosConstancia): Promise<ResultadoSello> {
  const [{ PDFDocument, StandardFonts, rgb }, pdfjs] = await Promise.all([import('pdf-lib'), import('pdfjs-dist')])
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  const firma = await firmaRecortada(lienzo)
  const lineas = lineasSello(datos)

  // Tamaños del sello en puntos de PDF (1 pt = 1/72"): se prueba grande y se achica si no entra.
  const TAMANOS = [{ w: 290, h: 136 }, { w: 255, h: 120 }, { w: 230, h: 108 }, { w: 200, h: 96 }]
  const ESCALA = 2 // 2 píxeles por punto: la letra chica y clara se ve (con 1 se perdía)
  const lector = await pdfjs.getDocument({ data: remito.slice() }).promise
  let elegido: { pagina: number; x: number; yPdf: number; w: number; h: number } | null = null
  for (let n = lector.numPages; n >= 1 && !elegido; n--) {
    const pag = await lector.getPage(n)
    const vista = pag.getViewport({ scale: ESCALA })
    if (pag.rotate % 360 !== 0) continue // hoja girada: se usa otra o una hoja nueva
    const c = document.createElement('canvas'); c.width = Math.ceil(vista.width); c.height = Math.ceil(vista.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await pag.render({ canvas: c, canvasContext: ctx, viewport: vista }).promise
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data
    const gris = new Uint8Array(c.width * c.height)
    for (let i = 0; i < gris.length; i++) gris[i] = (rgba[i * 4] * 3 + rgba[i * 4 + 1] * 6 + rgba[i * 4 + 2]) / 10
    for (const t of TAMANOS) {
      const h = buscarHueco(gris, c.width, c.height, Math.round(t.w * ESCALA), Math.round(t.h * ESCALA))
      if (h) {
        const [px, py] = vista.convertToPdfPoint(h.x, h.y + h.h) // esquina de abajo a la izquierda, en puntos del PDF
        elegido = { pagina: n - 1, x: px, yPdf: py, w: t.w, h: t.h }
        break
      }
    }
  }

  const doc = await PDFDocument.load(remito, { ignoreEncryption: true })
  let hojaNueva = false
  if (!elegido) {
    const primera = doc.getPage(0).getSize()
    const nueva = doc.addPage([primera.width, primera.height])
    nueva.drawText(seguro(`Firma del remito ${datos.pedido.n_remito} · ${datos.pedido.cliente}`).slice(0, 90), { x: 40, y: primera.height - 60, size: 13, font: await doc.embedFont(StandardFonts.HelveticaBold) })
    elegido = { pagina: doc.getPageCount() - 1, x: 40, yPdf: primera.height - 90 - 150, w: 300, h: 150 }
    hojaNueva = true
  }
  const pagina = doc.getPage(elegido.pagina)
  const fuente = await doc.embedFont(StandardFonts.Helvetica)
  const imagen = await doc.embedPng(firma.png)
  const { x, yPdf: y, w, h } = elegido
  const tam = Math.max(8, Math.min(10.5, h / 12)) // legible impreso y en el celular (Felipe, 21/11)
  const altoTexto = lineas.length * (tam + 2.2) + 4
  // firma arriba (proporcional), una línea fina como la de «firma» y los renglones abajo, sin recuadro (Felipe, 21/11)
  const altoFirma = h - altoTexto - 6
  const esc = Math.min((w - 8) / firma.w, altoFirma / firma.h)
  const fw = firma.w * esc; const fh = firma.h * esc
  pagina.drawImage(imagen, { x: x + (w - fw) / 2, y: y + altoTexto + 3 + (altoFirma - fh) / 2, width: fw, height: fh })
  pagina.drawLine({ start: { x: x + 6, y: y + altoTexto + 1 }, end: { x: x + w - 6, y: y + altoTexto + 1 }, thickness: 0.4, color: rgb(0.6, 0.6, 0.6) })
  lineas.forEach((l, i) => {
    let t = l
    while (t.length > 4 && fuente.widthOfTextAtSize(t, tam) > w - 8) t = t.slice(0, -2) + '…'
    pagina.drawText(t, { x: x + 4, y: y + altoTexto - (i + 1) * (tam + 2.2), size: tam, font: fuente, color: rgb(0.08, 0.08, 0.08) })
  })
  const pdf = await doc.save()

  // vista previa de la hoja firmada (para que quien entrega vea dónde quedó antes de guardar)
  const previo = await pdfjs.getDocument({ data: pdf.slice() }).promise
  const pag = await previo.getPage(elegido.pagina + 1)
  const v = pag.getViewport({ scale: 1.4 })
  const c = document.createElement('canvas'); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height)
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  await pag.render({ canvas: c, canvasContext: ctx, viewport: v }).promise
  return { pdf, pagina: elegido.pagina + 1, hojaNueva, vista: c.toDataURL('image/jpeg', 0.8) }
}
