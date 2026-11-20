// Impresión de remitos en tanda: junta los PDF (o fotos) de varios remitos en un solo documento y abre
// UNA sola impresión. Ninguna página web puede imprimir sin mostrar el cuadro de impresión: para que salga
// directo a la impresora, Chrome se abre en esa compu con --kiosk-printing (ver Expedición → Impresión).

const CLAVE_AUTO = 'poli-entregas-imprime-solo'

/** Esta compu imprime sola los remitos nuevos (se elige en cada dispositivo). */
export function imprimeSolo(): boolean {
  try { return localStorage.getItem(CLAVE_AUTO) === '1' } catch { return false }
}

export function setImprimeSolo(si: boolean): void {
  try {
    if (si) localStorage.setItem(CLAVE_AUTO, '1')
    else localStorage.removeItem(CLAVE_AUTO)
  } catch { /* sin storage: no queda guardado */ }
}

/** Páginas de un archivo listas para imprimir (imágenes). PDF: cada página se dibuja; foto: va tal cual. */
export async function paginasDeArchivo(url: string, mime: string | null, nombre = ''): Promise<string[]> {
  const esPdf = (mime ?? '').includes('pdf') || /\.pdf$/i.test(nombre)
  if (!esPdf) return [url]
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`No se pudo bajar el remito (${resp.status})`)
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await resp.arrayBuffer()) }).promise
  const out: string[] = []
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n)
    const vista = pagina.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vista.width)
    canvas.height = Math.ceil(vista.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no pudo preparar la impresión')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pagina.render({ canvas, canvasContext: ctx, viewport: vista }).promise
    out.push(canvas.toDataURL('image/jpeg', 0.9))
  }
  return out
}

/** Documento HTML con una página impresa por imagen. */
export function htmlImpresion(paginas: string[]): string {
  const imgs = paginas.map((src) => `<img src="${src.replace(/"/g, '&quot;')}" alt="">`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Remitos</title><style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 100%; height: auto; page-break-after: always; break-after: page; }
img:last-child { page-break-after: auto; break-after: auto; }
</style></head><body>${imgs}</body></html>`
}

/** Abre una sola impresión con todas las páginas. Vuelve cuando se cerró el cuadro (o salió directo). */
export async function imprimirPaginas(paginas: string[]): Promise<void> {
  if (!paginas.length) return
  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(marco)
  try {
    const doc = marco.contentDocument
    if (!doc || !marco.contentWindow) throw new Error('El navegador no pudo preparar la impresión')
    doc.open()
    doc.write(htmlImpresion(paginas))
    doc.close()
    await Promise.all([...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise<void>((ok) => {
      img.onload = () => ok()
      img.onerror = () => ok()
    }))))
    marco.contentWindow.focus()
    marco.contentWindow.print()
  } finally {
    // Con impresión directa el trabajo se manda en segundo plano: se saca el marco un rato después.
    window.setTimeout(() => marco.remove(), 60_000)
  }
}
