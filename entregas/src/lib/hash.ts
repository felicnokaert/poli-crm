// SHA-256 de un archivo, calculado en el navegador (el archivo no sale de la PC para esto).
export async function sha256Hex(archivo: Blob): Promise<string> {
  const buffer = await archivo.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
