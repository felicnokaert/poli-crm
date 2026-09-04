// Excel en español (y algunos exports de Google Sheets) guardan CSV en
// Windows-1252/Latin-1, no UTF-8. Si lo leemos siempre como UTF-8, cada
// acento y la ñ se rompen (el mismo tipo de daño que ya encontramos en
// datos viejos de la cartera). Node/el navegador no exponen el encoding
// real del archivo, así que lo inferimos: decodificamos como UTF-8 y, si
// aparece el carácter de reemplazo U+FFFD (evidencia de bytes inválidos
// para UTF-8), volvemos a decodificar como Windows-1252.
export function decodeSmart(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
}

export async function readFileSmart(file) {
  const buffer = await file.arrayBuffer();
  return decodeSmart(buffer);
}
