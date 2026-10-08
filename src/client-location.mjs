// Ubicación de los clientes (provincia, ciudad, domicilio) para el mapa de cobertura.
// Puro y testeado (test/client-location.test.mjs). Tres cosas:
//   1. pendientesDeUbicacion: qué clientes no se pueden ubicar y cuáles conviene completar primero.
//   2. leerUbicaciones: lee las filas de una planilla (Contabilium u otra) con CUIT + localidad/provincia.
//   3. planearUbicaciones / aplicarUbicaciones: completa SOLO los campos vacíos, sin pisar lo cargado a mano.
import { normClave, provinciaCanonica } from './georef.mjs';
import { docDe, isoFromCrmDate } from './map-clients-adapter.mjs';

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');
const texto = (valor) => String(valor ?? '').trim();
const CIUDAD_VACIA = new Set(['', 'A CONFIRMAR', 'SIN IDENTIFICAR', 'S/D', '-', 'NO INFORMADO']);

export const ciudadVacia = (ciudad) => CIUDAD_VACIA.has(normClave(ciudad));
export const provinciaVacia = (provincia) => !provinciaCanonica(provincia);

// ---- 1. Pendientes ----
// Un cliente está "pendiente" si no tiene provincia reconocible o no tiene ciudad. Se ordenan
// primero los que compraron (más reciente, y más facturas): son los que más cuentan en el mapa.
export function pendientesDeUbicacion(clients = []) {
  const vistos = new Set();
  const lista = [];
  for (const client of clients) {
    const doc = docDe(client);
    if (!doc || vistos.has(doc)) continue;
    vistos.add(doc);
    const sinProvincia = provinciaVacia(client.province);
    const sinCiudad = ciudadVacia(client.city);
    if (!sinProvincia && !sinCiudad) continue;
    const conDocumento = soloDigitos(doc).length >= 7 && soloDigitos(doc) === doc; // CUIT/DNI; si no, doc es el id interno del CRM
    lista.push({
      doc,
      conDocumento,
      esCuit: doc.length === 11,
      nombre: texto(client.legalName) || texto(client.company) || 'Sin nombre',
      telefono: texto(client.phone),
      ultimaCompra: isoFromCrmDate(client.lastPurchase),
      compras: Number(client.totalPurchases) || 0,
      sinProvincia,
      sinCiudad,
    });
  }
  lista.sort((a, b) => {
    if (Boolean(a.ultimaCompra) !== Boolean(b.ultimaCompra)) return a.ultimaCompra ? -1 : 1;
    if (a.ultimaCompra !== b.ultimaCompra) return String(b.ultimaCompra).localeCompare(String(a.ultimaCompra));
    return b.compras - a.compras || a.nombre.localeCompare(b.nombre);
  });
  return lista;
}

export function resumenPendientes(pendientes) {
  return {
    total: pendientes.length,
    sinProvincia: pendientes.filter((p) => p.sinProvincia).length,
    sinCiudad: pendientes.filter((p) => p.sinCiudad).length,
    compradores: pendientes.filter((p) => p.ultimaCompra).length,
    sinDocumento: pendientes.filter((p) => !p.conDocumento).length, // no se pueden cruzar por CUIT: se completan a mano en la ficha
  };
}

// Planilla para completar (o para comparar con el export de Contabilium): una fila por pendiente.
export const COLUMNAS_PLANILLA = ['CUIT', 'Razón social', 'Última compra', 'Domicilio', 'Localidad', 'Provincia', 'Código postal', 'Teléfono', 'Email'];
export function filasPlanilla(pendientes) {
  return [
    COLUMNAS_PLANILLA,
    ...pendientes.filter((p) => p.conDocumento).map((p) => [p.doc, p.nombre, p.ultimaCompra || '', '', '', '', '', p.telefono, '']),
  ];
}

// ---- 2. Leer una planilla ----
// Cada campo se busca por varios nombres de columna posibles (Contabilium, Excel propio, etc.).
const ALIAS = {
  doc: ['CUIT', 'CUIL', 'CUIT CUIL', 'NRO DOC', 'NRO DOCUMENTO', 'NUMERO DOCUMENTO', 'NUMERO DE DOCUMENTO', 'DOCUMENTO', 'DNI', 'NRO'],
  address: ['DOMICILIO', 'DIRECCION', 'CALLE', 'DOMICILIO FISCAL', 'DIRECCION FISCAL'],
  city: ['LOCALIDAD', 'CIUDAD', 'LOCALIDAD CIUDAD'],
  province: ['PROVINCIA', 'PROV'],
  postalCode: ['CODIGO POSTAL', 'COD POSTAL', 'CP', 'C P'],
  phone: ['TELEFONO', 'CELULAR', 'TEL', 'TELEFONO CELULAR', 'MOVIL'],
  email: ['EMAIL', 'E MAIL', 'MAIL', 'CORREO', 'CORREO ELECTRONICO'],
};

export function columnasDe(encabezados = []) {
  // "CUIT/CUIL", "E-mail", "Nro. Documento" y "C.P." quedan como palabras sueltas para comparar.
  const claves = encabezados.map((encabezado) => normClave(encabezado).replace(/[^A-Z0-9]+/g, ' ').trim());
  const mapa = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    // Prioridad por orden de alias (CUIT antes que NRO) y no por orden de columnas.
    for (const nombre of alias) {
      const indice = claves.indexOf(nombre);
      if (indice !== -1) { mapa[campo] = indice; break; }
    }
  }
  return mapa;
}

// `filas` = matriz (primera fila = encabezados), como la entrega la librería de planillas.
export function leerUbicaciones(filas = []) {
  if (!filas.length) return { registros: [], columnas: {}, sinDocumento: 0 };
  const columnas = columnasDe(filas[0]);
  if (columnas.doc === undefined) return { registros: [], columnas, sinDocumento: 0, error: 'No encontré una columna de CUIT (se llama "CUIT", "CUIL" o "Documento").' };
  const registros = [];
  let sinDocumento = 0;
  for (const fila of filas.slice(1)) {
    const doc = soloDigitos(fila[columnas.doc]);
    if (doc.length < 7) { if (fila.some((celda) => texto(celda))) sinDocumento += 1; continue; }
    const dato = (campo) => (columnas[campo] === undefined ? '' : texto(fila[columnas[campo]]));
    registros.push({ doc, address: dato('address'), city: dato('city'), province: dato('province'), postalCode: dato('postalCode'), phone: dato('phone'), email: dato('email') });
  }
  return { registros, columnas, sinDocumento };
}

// ---- 3. Plan de cambios ----
const ETIQUETAS = { province: 'provincia', city: 'localidad', address: 'domicilio', postalCode: 'código postal', phone: 'teléfono', email: 'email' };

export function planearUbicaciones(clients = [], registros = []) {
  const porDoc = new Map();
  for (const client of clients) {
    const doc = docDe(client);
    if (doc && !porDoc.has(doc)) porDoc.set(doc, client);
  }
  const cambios = [];
  const sinCliente = [];
  const provinciasDesconocidas = new Map();
  let sinNovedad = 0;
  const vistos = new Set();
  for (const registro of registros) {
    if (vistos.has(registro.doc)) continue; // si la planilla repite un CUIT, vale la primera fila
    vistos.add(registro.doc);
    const client = porDoc.get(registro.doc);
    if (!client) { sinCliente.push(registro.doc); continue; }
    const nuevo = {};
    const canonica = provinciaCanonica(registro.province);
    if (registro.province && !canonica) provinciasDesconocidas.set(registro.province, (provinciasDesconocidas.get(registro.province) || 0) + 1);
    if (canonica && provinciaVacia(client.province)) nuevo.province = canonica.nombre;
    if (registro.city && !ciudadVacia(registro.city) && ciudadVacia(client.city)) nuevo.city = registro.city;
    if (registro.address && !texto(client.address)) nuevo.address = registro.address;
    if (registro.postalCode && !texto(client.postalCode)) nuevo.postalCode = registro.postalCode;
    if (registro.phone && !texto(client.phone)) nuevo.phone = registro.phone;
    if (registro.email && !texto(client.email)) nuevo.email = registro.email;
    if (Object.keys(nuevo).length) cambios.push({ doc: registro.doc, nombre: texto(client.legalName) || texto(client.company), nuevo });
    else sinNovedad += 1;
  }
  const porCampo = {};
  for (const cambio of cambios) for (const campo of Object.keys(cambio.nuevo)) porCampo[ETIQUETAS[campo]] = (porCampo[ETIQUETAS[campo]] || 0) + 1;
  return { cambios, sinCliente, sinNovedad, porCampo, provinciasDesconocidas: [...provinciasDesconocidas.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })) };
}

// Aplica el plan sobre la lista de clientes (devuelve una lista nueva; no toca la original).
export function aplicarUbicaciones(clients = [], cambios = [], ahora = new Date().toISOString()) {
  const porDoc = new Map(cambios.map((cambio) => [cambio.doc, cambio.nuevo]));
  return clients.map((client) => {
    const nuevo = porDoc.get(docDe(client));
    return nuevo ? { ...client, ...nuevo, updatedAt: ahora } : client;
  });
}

// ---- Texto de un CSV ----
// Los CSV llegan en UTF-8 (con o sin BOM) o en Windows-1252 (el "CSV" común de Excel). Si se leen
// como bytes sueltos las tildes se rompen ("Teléfono" -> "TelÃ©fono") y la columna no se reconoce.
export function decodificarTexto(bytes) {
  const datos = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let contenido;
  try {
    contenido = new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    contenido = new TextDecoder('windows-1252').decode(datos);
  }
  return contenido.replace(/^﻿/, '');
}
