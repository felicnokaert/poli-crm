// Ciudad a partir del código postal (para completar clientes que tienen CP pero no ciudad).
// Puro y testeado (test/codigo-postal.test.mjs). La tabla sale de scripts/build-codigos-postales.mjs
// (public/mapa/data/codigos-postales.json) y solo trae los códigos con una ciudad de alta confianza.
import { provinciaCanonica } from './georef.mjs';

export const CIUDAD_CABA = 'Ciudad de Buenos Aires';
export const URL_TABLA_CP = '/mapa/data/codigos-postales.json';

// "7600", "B7600FWB" (formato CPA) o " 7600 " -> "7600"; cualquier otra cosa -> null.
export function codigoDeCuatro(codigoPostal) {
  const m = /^[A-Za-z]?\s*(\d{4})\s*[A-Za-z]{0,3}$/.exec(String(codigoPostal ?? '').trim());
  return m ? m[1] : null;
}

// Devuelve el nombre de la ciudad o null si no se puede asegurar. Capital Federal no necesita tabla.
export function ciudadPorCodigoPostal(tabla, provincia, codigoPostal) {
  const prov = provinciaCanonica(provincia);
  const codigo = codigoDeCuatro(codigoPostal);
  if (!prov || !codigo) return null;
  if (prov.cod === '02') return CIUDAD_CABA;
  return tabla?.c?.[`${prov.cod}|${codigo}`] || null;
}

let tablaEnMemoria = null;
export async function cargarTablaCodigosPostales(fetchImpl = fetch) {
  if (tablaEnMemoria) return tablaEnMemoria;
  const respuesta = await fetchImpl(URL_TABLA_CP);
  if (!respuesta.ok) throw new Error('No se pudo cargar la tabla de códigos postales.');
  tablaEnMemoria = await respuesta.json();
  return tablaEnMemoria;
}
