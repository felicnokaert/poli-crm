/* Reglas de Devoluciones (sin React, para probarlas con node:test). */
export const ESTADOS_DEV = [
  ['buen', 'Buen estado'],
  ['mal', 'Mal estado / dañado'],
  ['incompleto', 'Incompleto'],
];
export const TXT_ESTADO = Object.fromEntries(ESTADOS_DEV);
export const TRANSPORTES = ['Correo Argentino', 'OCA', 'Full Pack', 'Otro'];
export const VENTAS_ECOMMERCE = 'Brenda y Yuliani';

/* Etiquetas de prueba (simuladas): una por transporte. No existen en Mercado Libre. */
export const DEMO = {
  '41000000001': { devolucion_ml: '2000009871', transportista: 'Correo Argentino', cuenta: 'POLIPLAST SRL', comprador: 'MARTIN_G (prueba)', motivo: 'No era lo que esperaba', lineas: [{ sku: 'RE-608-1.6', descripcion: 'Resina Epoxi 1.6 Kg', esperado: 1 }] },
  '41000000002': { devolucion_ml: '2000009872', transportista: 'OCA', cuenta: 'FOAMFACTORY', comprador: 'LAURA.P (prueba)', motivo: 'Llegó dañado', lineas: [{ sku: 'TELA-4OZ-1', descripcion: 'Tela 4 oz x 1 m', esperado: 5 }, { sku: 'MEK-100ML', descripcion: 'Catalizador 100 gr', esperado: 2 }] },
  '41000000003': { devolucion_ml: '2000009873', transportista: 'Full Pack', cuenta: 'POLIPLAST SRL', comprador: 'NAUTICA_SUR (prueba)', motivo: 'Se arrepintió de la compra', lineas: [{ sku: 'R-29', descripcion: 'Resina preacelerada R-29 x 1 kg', esperado: 1 }] },
};

/** Número de la etiqueta de vuelta: el número de envío de ML (~11 dígitos) o el código del transporte. */
export function numeroEtiqueta(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (t.startsWith('{')) { try { const j = JSON.parse(t); if (j && j.id) return String(j.id); } catch (e) { /* sigue */ } }
  const dig = (t.match(/\d+/g) || []).find((x) => x.length >= 9 && x.length <= 14);
  if (dig) return dig;
  const alnum = t.replace(/[^A-Za-z0-9-]/g, '');
  return alnum.length >= 4 && alnum.length <= 40 ? alnum.toUpperCase() : null;
}

/** OK solo si todo vino en buen estado y en la cantidad esperada (la base lo vuelve a calcular). */
export function resultadoDev(lineas, origen = 'ml') {
  if (origen === 'otra') return 'revisar';
  return lineas.every((l) => l.estado === 'buen' && (l.esperado == null || Number(l.recibido) === Number(l.esperado))) ? 'ok' : 'revisar';
}
/** Qué falta para poder guardar (texto para el botón) o null. */
export function faltaDev(lineas, fotos) {
  if (!lineas.length) return 'Falta el producto';
  if (lineas.some((l) => !String(l.sku || l.descripcion || '').trim())) return 'Falta qué producto es';
  if (lineas.some((l) => !l.estado)) return 'Elegí el estado de cada producto';
  if (lineas.some((l) => l.estado !== 'buen' && String(l.nota || '').trim().length < 3)) return 'Contá qué tiene';
  if (lineas.some((l) => l.estado !== 'buen') && !fotos.length) return 'Falta la foto';
  return null;
}


/** Motivo del comprador: ML manda un código (reason_id); si no lo conocemos, se muestra tal cual. */
const MOTIVOS_ML = { PDD: 'Distinto a lo publicado o defectuoso', PNR: 'No le llegó el producto' }; // prefijos de reason_id de reclamos de ML
export function motivoML(r) {
  const t = String(r || '').trim();
  if (!t) return '';
  const k = Object.keys(MOTIVOS_ML).find((x) => t.toUpperCase().startsWith(x));
  return k ? MOTIVOS_ML[k] : t;
}
