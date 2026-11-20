// Texto de un PDF línea por línea, respetando el orden visual (adaptado de poli-crm/src/pdf-text.js).
// pdfjs se carga recién cuando hace falta para no engordar la primera carga de la app.
interface ItemTexto { str: string; transform: number[] }

function lineasDesdeItems(items: ItemTexto[]): string[] {
  const filas = new Map<number, ItemTexto[]>()
  for (const item of items) {
    const y = Math.round(item.transform[5])
    const clave = [...filas.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
    if (!filas.has(clave)) filas.set(clave, [])
    filas.get(clave)!.push(item)
  }
  return [...filas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, fila]) => fila.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
}

export async function extraerTextoPdf(archivo: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  const datos = new Uint8Array(await archivo.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data: datos }).promise
  const paginas: string[] = []
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n)
    const contenido = await pagina.getTextContent()
    paginas.push(lineasDesdeItems(contenido.items as unknown as ItemTexto[]).join('\n'))
  }
  return paginas.join('\n')
}
