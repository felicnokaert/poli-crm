// Link compartible del mapa de cobertura: genera el link secreto y la "foto" publica.
// Lo que se publica pasa SIEMPRE por buildPublicSnapshot: una lista blanca de campos. Email,
// domicilio y notas internas no salen nunca, ni con ninguna opcion. CUIT y telefono salen solo si
// quien publica lo tilda (opciones cuit / telefono), y para personas fisicas ademas datosPersonas.
const TEXTO_TIPO = {
  aplicador: 'Aplicador', inyeccion: 'Inyección', fabricante: 'Fabricante', no_aplica: 'Cliente', otro: 'Cliente',
};

export const OPCIONES_POR_DEFECTO = Object.freeze({
  nombres: true, // razon social de EMPRESAS (CUIT 30/33/34)
  nombresPersonas: false, // nombre de personas fisicas (CUIT 20/23/24/27 o DNI): apagado por defecto
  cuit: false, // CUIT de empresas: solo si quien publica lo tilda
  telefono: false, // telefono/celular de empresas: solo si quien publica lo tilda
  datosPersonas: false, // extiende cuit/telefono a PERSONAS FISICAS (datos personales): tilda aparte
  productos: false, // productos, kilos y cantidad de facturas
  soloAplicadores: false,
});

// 32 bytes al azar en base64url = 43 caracteres (el mismo formato que valida el servidor).
export function generateShareToken(cryptoImpl = globalThis.crypto) {
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(32));
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// SHA-256 en hexa: igual que lib/map-share.mjs (hashShareToken) del lado del servidor.
export async function hashTokenHex(token, cryptoImpl = globalThis.crypto) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function esPersonaFisica(cliente) {
  const doc = String(cliente.doc || '').replace(/\D/g, '');
  if (cliente.tipo_doc === 'DNI' || doc.length !== 11) return true;
  return ['20', '23', '24', '27'].includes(doc.slice(0, 2));
}

// mapClients: clientes ya en el formato del mapa (map-clients-adapter.mjs). Devuelve el
// contenido a guardar en map_shares.snapshot. Solo entran compradores ubicados.
export function buildPublicSnapshot(mapClients = [], opciones = {}, fechaExport = new Date().toISOString().slice(0, 10)) {
  const config = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const elegibles = mapClients.filter((c) => c.compro && c.lat != null && c.lon != null
    && (!config.soloAplicadores || c.tipo === 'aplicador'));
  const clientes = elegibles.map((c, index) => {
    const persona = esPersonaFisica(c);
    const mostrarNombre = config.nombres && (config.nombresPersonas || !persona);
    const contactoPermitido = !persona || config.datosPersonas; // CUIT/telefono de una persona = dato personal
    const conCuit = config.cuit && contactoPermitido;
    return {
      doc: `p${index + 1}`, // identificador opaco: la identidad del cliente en la foto NO es su CUIT
      cuit: conCuit ? c.cuit : '', tipo_doc: conCuit ? c.tipo_doc : '',
      telefono: config.telefono && contactoPermitido ? c.telefono : '',
      email: '', domicilio: '', cp: '',
      razon_social: mostrarNombre ? c.razon_social : `${TEXTO_TIPO[c.tipo] || 'Cliente'} ${index + 1}`,
      provincia_cod: c.provincia_cod, provincia: c.provincia, localidad: c.localidad,
      compro: true, ultima_compra: c.ultima_compra,
      n_facturas: config.productos ? c.n_facturas : 0, n_cotizaciones: 0, ultima_cotizacion: null,
      productos: config.productos ? c.productos.map((p) => ({ producto: p.producto, veces: p.veces, kg: p.kg, ultima: p.ultima })) : [],
      es_aplicador: c.es_aplicador, tipo: c.tipo, tipo_auto: c.tipo, tipo_origen: null, tipo_nota: '',
      lat: c.lat, lon: c.lon, depto_id: c.depto_id, precision: c.precision, motivo_aprox: c.motivo_aprox,
    };
  });
  return {
    clientes,
    fecha_export: fechaExport,
    publico: { nombres: Boolean(config.nombres), productos: Boolean(config.productos), cuit: Boolean(config.cuit), telefono: Boolean(config.telefono) },
  };
}
