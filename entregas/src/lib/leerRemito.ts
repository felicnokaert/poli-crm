// Lee un archivo de remito (PDF de Contabilium o foto) y devuelve los datos para precargar el alta.
import { mensajeError } from './api'
import { api } from './cliente'
import { sha256Hex } from './hash'
import { extraerTextoPdf } from './pdfText'
import { adivinarExpreso, pareceGuiaDeExpreso, parseRemito } from './remitoParser'
import type { Expreso, NuevoPedido } from './types'

export interface Aviso { tipo: 'warn' | 'ok' | 'info'; texto: string }

export const PEDIDO_VACIO: NuevoPedido = {
  n_remito: '', fecha_remito: null, cliente: '', cuit: null, direccion: null, localidad: null, provincia: null, cp: null,
  telefono: null, contacto: null, nota: null, expreso_id: null, items: [], remito_hash: null,
}

export interface Lectura {
  datos: Partial<NuevoPedido> & { remito_hash: string }
  aviso: Aviso
  /** El archivo es una guía del expreso, no un remito: no se carga como pedido. */
  esGuia?: boolean
  /** Texto leído del PDF (para buscar a qué pedido es la guía). */
  texto?: string
}

export const AVISO_GUIA: Aviso = {
  tipo: 'warn',
  texto: 'Esto es una guía del expreso, no un remito: no se carga como pedido nuevo. Las guías se suben en Expedición → «Subir guías» o desde el pedido.',
}

export async function leerRemito(f: File, expresosActivos: Expreso[]): Promise<Lectura> {
  const hash = await sha256Hex(f)
  if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
    return { datos: { remito_hash: hash }, aviso: { tipo: 'info', texto: 'Es una imagen: completá los datos a mano.' } }
  }
  try {
    const texto = await extraerTextoPdf(f)
    if (pareceGuiaDeExpreso(texto)) return { datos: { remito_hash: hash }, aviso: AVISO_GUIA, esGuia: true, texto }
    const r = parseRemito(texto)
    if (r.camposLeidos < 2) {
      return { datos: { remito_hash: hash }, aviso: { tipo: 'warn', texto: 'No pude leer los datos de este PDF (¿es un escaneo?). Completalos a mano.' } }
    }
    const expreso = adivinarExpreso(r.transporte, expresosActivos)
    const datos: Lectura['datos'] = {
      n_remito: r.n_remito || undefined,
      fecha_remito: r.fecha_remito,
      cliente: r.cliente || undefined,
      cuit: r.cuit,
      direccion: r.direccion,
      localidad: r.localidad,
      provincia: r.provincia,
      cp: r.cp,
      telefono: r.telefono || undefined,
      items: r.items,
      expreso_id: expreso?.id,
      remito_hash: hash,
    }
    // Si el remito no trae teléfono, lo busca en la base de clientes del CRM.
    if (!r.telefono) datos.telefono = (await api.telefonoCliente(r.cuit, r.cliente)) ?? undefined
    const aviso: Aviso = r.tipoDetectado && r.tipoDetectado !== 'Remito'
      ? { tipo: 'warn', texto: `Ojo: el PDF parece una ${r.tipoDetectado}, no un remito. Revisá que sea el archivo correcto.` }
      : { tipo: 'ok', texto: `Leí el remito${r.items.length ? `: ${r.items.length} producto${r.items.length === 1 ? '' : 's'}` : ''}. Revisá los datos y elegí el expreso.` }
    return { datos: Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)) as Lectura['datos'], aviso }
  } catch (e) {
    return { datos: { remito_hash: hash }, aviso: { tipo: 'warn', texto: `No pude leer el PDF (${mensajeError(e)}). Completá los datos a mano.` } }
  }
}
