// SHA-256 de un archivo del navegador (File/Blob), en hexadecimal. Usa
// Web Crypto (SubtleCrypto) - no hay dependencia externa ni el archivo sale
// del navegador para calcularlo. El importador de la base técnica lo usa
// para armar los candidatos que después clasifica classifyInventoryImport().
export async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
