// Detecta el número de guía en la foto (o PDF) de la guía del expreso. Primero intenta el código de barras
// (preciso; lo leen Chrome/Android), después el texto (PDF con texto o reconocimiento de la foto).
// Siempre es una sugerencia: la persona confirma o corrige antes de guardarla.
import { extraerTextoPdf } from './pdfText'

export interface GuiaDetectada {
  numero: string
  fuente: 'codigo' | 'texto'
}

const CUIT = /^(20|23|24|27|30|33|34)\d{9}$/
const ETIQUETA = /(?:n[°ºo]?\.?\s*(?:de\s*)?gu[ií]a|gu[ií]a\s*(?:n[°ºo]?\.?|nro\.?|numero|número)?|tracking|n[°ºo]?\s*de\s*env[ií]o|seguimiento)\s*[:#.]?\s*([A-Z]{0,4}[\s-]?\d[\d\s-]{5,26}\d)/i

function limpiar(v: string): string {
  return v.replace(/[\s-]+/g, '').toUpperCase()
}

function plausible(n: string): boolean {
  const digitos = n.replace(/\D/g, '')
  if (digitos.length < 6 || n.length > 26) return false
  if (CUIT.test(n)) return false
  if (/^(?:54)?9?(?:11|15)\d{8}$/.test(n)) return false // teléfono
  return true
}

/** Mejor candidato a número de guía dentro de un texto. */
export function candidatoGuia(texto: string): string | null {
  const t = texto.replace(/\r/g, '')
  // Código de seguimiento con letras (Credifin: «Seguimiento: COZ07Z»): es el que pide la página del expreso.
  const seg = t.match(/seguimiento\s*(?:n[°ºo]?\.?)?\s*[:#]?\s*([A-Za-z0-9]{5,12})\b/i)?.[1]
  if (seg && seg === seg.toUpperCase() && /\d/.test(seg) && /[A-Z]/.test(seg)) {
    // Si además trae el N° de guía («GUIA: 4120-00002980»), se guardan los dos: «COZ07Z / 4120-00002980».
    const guia = t.match(/gu[ií]a\s*(?:n[°ºo]?\.?)?\s*:\s*(\d[\d-]{5,22}\d)/i)?.[1]
    return guia ? `${seg} / ${guia}` : seg
  }
  const conEtiqueta = t.match(ETIQUETA)?.[1]
  if (conEtiqueta) {
    const n = limpiar(conEtiqueta)
    if (plausible(n)) return n
  }
  // Sin etiqueta: la secuencia de números más larga (8 a 20 dígitos) que no sea CUIT, teléfono ni fecha.
  const candidatos = (t.match(/\d[\d -]{6,24}\d/g) ?? [])
    .map(limpiar)
    .filter((n) => /^\d{8,20}$/.test(n) && plausible(n))
    .sort((a, b) => b.length - a.length)
  return candidatos[0] ?? null
}

/** Mejor valor entre los códigos de barras leídos. */
export function elegirCodigo(valores: string[]): string | null {
  const limpios = valores.map((v) => limpiar(v)).filter((v) => /^[A-Z0-9]{6,26}$/.test(v) && plausible(v))
  const numericos = limpios.filter((v) => /^\d+$/.test(v))
  const pool = numericos.length ? numericos : limpios
  return pool.sort((a, b) => b.length - a.length)[0] ?? null
}

interface DetectorDeCodigos { detect(img: ImageBitmapSource): Promise<{ rawValue: string }[]> }

async function porCodigoDeBarras(file: File): Promise<string | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => DetectorDeCodigos }).BarcodeDetector
  if (!Ctor) return null
  try {
    const detector = new Ctor({ formats: ['code_128', 'code_39', 'code_93', 'itf', 'ean_13', 'codabar', 'qr_code', 'pdf417', 'data_matrix'] })
    const imagen = await createImageBitmap(file)
    const hallados = await detector.detect(imagen)
    return elegirCodigo(hallados.map((h) => h.rawValue))
  } catch {
    return null
  }
}

async function porTextoDeFoto(file: File): Promise<string | null> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(file)
    return candidatoGuia(data.text)
  } finally {
    void worker.terminate()
  }
}

export async function detectarGuia(file: File): Promise<GuiaDetectada | null> {
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (esPdf) {
    try {
      const n = candidatoGuia(await extraerTextoPdf(file))
      return n ? { numero: n, fuente: 'texto' } : null
    } catch {
      return null
    }
  }
  if (!file.type.startsWith('image/')) return null
  const codigo = await porCodigoDeBarras(file)
  if (codigo) return { numero: codigo, fuente: 'codigo' }
  try {
    const n = await porTextoDeFoto(file)
    return n ? { numero: n, fuente: 'texto' } : null
  } catch {
    return null
  }
}

/** Lector de fotos que se reusa para varias guías seguidas (crear uno por foto es lento). */
export interface LectorFotos {
  leer(imagen: File | string): Promise<string>
  cerrar(): void
}

export async function crearLectorFotos(): Promise<LectorFotos> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  return {
    async leer(imagen) { return (await worker.recognize(imagen)).data.text },
    cerrar() { void worker.terminate() },
  }
}

export interface LecturaGuia {
  /** Todo el texto que se pudo leer (para reconocer al cliente). */
  texto: string
  numero: GuiaDetectada | null
}

/** Lee una guía entera: el texto (PDF, o reconocimiento de la foto / del PDF escaneado) y el N° de guía. */
export async function leerGuiaCompleta(file: File, lector: () => Promise<LectorFotos>): Promise<LecturaGuia> {
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  let texto = ''
  if (esPdf) {
    try { texto = await extraerTextoPdf(file) } catch { texto = '' }
    if (texto.replace(/\s/g, '').length < 30) {
      // PDF escaneado: se dibujan las primeras páginas y se leen como foto.
      const { paginasDeArchivo } = await import('./impresion')
      const url = URL.createObjectURL(file)
      try {
        const paginas = (await paginasDeArchivo(url, 'application/pdf', file.name)).slice(0, 2)
        const l = await lector()
        for (const pag of paginas) texto += '\n' + await l.leer(pag)
      } catch { /* sin texto: se elige el pedido a mano */ } finally {
        URL.revokeObjectURL(url)
      }
    }
    const n = candidatoGuia(texto)
    return { texto, numero: n ? { numero: n, fuente: 'texto' } : null }
  }
  if (!file.type.startsWith('image/')) return { texto: '', numero: null }
  const codigo = await porCodigoDeBarras(file)
  try { texto = await (await lector()).leer(file) } catch { texto = '' }
  if (codigo) return { texto, numero: { numero: codigo, fuente: 'codigo' } }
  const n = candidatoGuia(texto)
  return { texto, numero: n ? { numero: n, fuente: 'texto' } : null }
}
