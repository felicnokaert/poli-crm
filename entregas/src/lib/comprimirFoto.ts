// Fotos de la cámara del celular (26/11, Felipe: «el remito firmado sacando la foto con la cámara no se toma»). Una foto de un
// celular nuevo pesa 5-20 MB (50-108 MP) y tarda o pasa el tope de 15 MB. Antes de subir se achica a 2000 px y JPEG 0,85
// (unos 300-700 KB, se lee igual de bien). Si el navegador no puede abrir la imagen (HEIC en algunas compus) o el resultado no
// es más chico, se sube la original. Mismo File de entrada → mismo File de salida (los reintentos no suben otra copia).
const hechas = new WeakMap<File, Promise<File>>()

const LADO_MAX = 2000
const CALIDAD = 0.85

async function decodificar(archivo: File): Promise<{ ancho: number; alto: number; dibujar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cerrar: () => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return { ancho: bmp.width, alto: bmp.height, dibujar: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), cerrar: () => bmp.close() }
    } catch { /* sigue con <img> */ }
  }
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('no se pudo abrir'))
      el.src = url
    })
    return { ancho: img.naturalWidth, alto: img.naturalHeight, dibujar: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), cerrar: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

async function achicar(archivo: File): Promise<File> {
  const tipo = archivo.type || ''
  const esFoto = tipo.startsWith('image/') ? !/gif|svg/.test(tipo) : /\.(jpe?g|png|webp|heic|heif)$/i.test(archivo.name)
  if (!esFoto) return archivo
  const img = await decodificar(archivo)
  if (!img || !img.ancho || !img.alto) return archivo
  try {
    const escala = Math.min(1, LADO_MAX / Math.max(img.ancho, img.alto))
    if (escala === 1 && archivo.size < 1.5 * 1024 * 1024) return archivo
    const w = Math.round(img.ancho * escala)
    const h = Math.round(img.alto * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return archivo
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    img.dibujar(ctx, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD))
    if (!blob || blob.size >= archivo.size) return archivo
    const nombre = archivo.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: archivo.lastModified })
  } catch {
    return archivo
  } finally {
    img.cerrar()
  }
}

export function comprimirFoto(archivo: File): Promise<File> {
  let hecha = hechas.get(archivo)
  if (!hecha) {
    hecha = achicar(archivo).catch(() => archivo)
    hechas.set(archivo, hecha)
  }
  return hecha
}
