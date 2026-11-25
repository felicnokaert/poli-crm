import { ApiError, type Api, type DetallePedido } from './api'
import { depositoActual, operadorActual } from './operador'
import { CONFIG_DEFAULT, type TipoArchivo, type Archivo, type Config, type Estado, type Evento, type Expreso, type Pedido, type Usuario } from './types'

/* Expedición SIN login: «quién sos y desde qué depósito» viaja en cada pedido a la función de servidor entregas-crm de la app de conteo,
   que consulta el CRM con su propia clave (nunca llega acá, ni la sesión de expedicion@). Lo que el servidor todavía no entrega
   (historial del pedido, archivos adjuntos: remitos y guías) se muestra vacío; ver LEEME-CONTEO.md. */

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://coldwrbfxpdfutbekysr.supabase.co'
const CLAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGR3cmJmeHBkZnV0YmVreXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjE0MzAsImV4cCI6MjEwMzkzNzQzMH0.7CloDCuNcsm4E3TcEO712RNZdTUvL_BmCrmXWHRRrrc' // clave pública anon (respaldo)
const noDisponible = (que: string) => () => Promise.reject(new ApiError(`${que} todavía no está disponible desde expedición. Se hace en Poli-Entregas.`))

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const lsGet = (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } }

interface RespuestaServidor { ok?: boolean; error?: string; [k: string]: unknown }

async function pedir(ruta: string, extra: Record<string, unknown> = {}, quien?: { operador: string; deposito: string }): Promise<RespuestaServidor> {
  const pin = lsGet('entregas_pin')
  let r: Response
  try {
    r = await fetch(`${URL_BASE}/functions/v1/entregas-crm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLAVE}`, apikey: CLAVE },
      body: JSON.stringify({ ruta, operador: quien?.operador ?? operadorActual(), deposito: quien?.deposito ?? depositoActual(), ...(pin ? { pin } : {}), ...extra }),
      signal: AbortSignal.timeout(30000), // con mala señal no queda «Guardando…» para siempre
    })
  } catch (e) {
    throw new ApiError((e as Error)?.name === 'TimeoutError' ? 'Tardó demasiado (señal floja). Probá de nuevo en un rato.' : 'Sin conexión. Revisá internet y probá de nuevo.')
  }
  const j = (await r.json().catch(() => null)) as RespuestaServidor | null
  if (!j) throw new ApiError('El servidor no respondió.')
  if (!j.ok) throw new ApiError(j.error === 'pin' ? 'Falta el PIN de expedición.' : (j.error || 'No se pudo consultar.'))
  return j
}

/* ---------- caché de la sesión de pantalla ---------- */
let pedidos: Pedido[] = []
let expresos: Expreso[] = []
let configCache: Config = CONFIG_DEFAULT
const urlsArchivos = new Map<string, string>() // link firmado (10 min) de cada archivo, lo entrega el CRM junto con el detalle

const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - 3 * 3600000 - n * 86400000).toISOString().slice(0, 10)

function aPedido(r: Record<string, unknown>): Pedido {
  const estado = r.estado as Estado
  const nGuia = (r.n_guia as string | null) ?? null
  return {
    id: String(r.id), codigo: Number(r.codigo), n_remito: String(r.n_remito ?? ''), fecha_remito: (r.fecha_remito as string | null) ?? null,
    cliente: String(r.cliente ?? ''), cuit: (r.cuit as string | null) ?? null, direccion: (r.direccion as string | null) ?? null,
    localidad: (r.localidad as string | null) ?? null, provincia: (r.provincia as string | null) ?? null, cp: (r.cp as string | null) ?? null,
    telefono: (r.telefono as string | null) ?? null, contacto: (r.contacto as string | null) ?? null, nota: (r.nota as string | null) ?? null,
    expreso_id: (r.expreso_id as string | null) ?? null,
    vendedor_id: String(r.vendedor_id ?? r.vendedor_email ?? ''), vendedor_email: (r.vendedor_email as string | null) ?? null,
    estado, estado_desde: String(r.estado_desde ?? r.updated_at ?? r.created_at ?? ''), impreso_at: (r.impreso_at as string | null) ?? null,
    bloqueo_motivo: (r.bloqueo_motivo as Pedido['bloqueo_motivo']) ?? null, bloqueo_detalle: (r.bloqueo_detalle as string | null) ?? null,
    stock_estimado: (r.stock_estimado as string | null) ?? null, fecha_despacho: (r.fecha_despacho as string | null) ?? null,
    n_guia: nGuia, bultos: (r.bultos as number | null) ?? null, fecha_entrega: (r.fecha_entrega as string | null) ?? null,
    incidencia_motivo: (r.incidencia_motivo as Pedido['incidencia_motivo']) ?? null, incidencia_detalle: (r.incidencia_detalle as string | null) ?? null,
    items: Array.isArray(r.items) ? (r.items as Pedido['items']) : [], remito_hash: null,
    created_at: String(r.created_at ?? ''), updated_at: String(r.updated_at ?? r.created_at ?? ''),
    operador: (r.operador as string | null) ?? null, deposito_salida: (r.deposito_salida as string | null) ?? null,
    tiene_guia_archivo: !!r.tiene_guia_archivo, tiene_comprobante: !!r.tiene_comprobante, archivos: Number(r.archivos ?? 0), ultima_actividad: (r.updated_at as string | null) ?? null,
    despacho_operador: (r.despacho_operador as string | null) ?? null, despacho_deposito: (r.deposito_salida as string | null) ?? null, despacho_user_id: null, despacho_email: null, despacho_at: (r.despacho_at as string | null) ?? null,
  }
}

async function cargarConfig(quien?: { operador: string; deposito: string }): Promise<void> {
  const r = await pedir('config', {}, quien)
  configCache = {
    ...CONFIG_DEFAULT,
    operadores: (r.operadores as string[] | undefined)?.length ? (r.operadores as string[]) : CONFIG_DEFAULT.operadores,
    depositos: (r.depositos as string[] | undefined)?.length ? (r.depositos as string[]) : CONFIG_DEFAULT.depositos,
  }
  expresos = ((r.expresos as Array<Record<string, unknown>> | undefined) ?? []).map((x, i) => ({
    id: String(x.id), nombre: String(x.nombre ?? ''), tracking_url: (x.tracking_url as string | null) ?? null,
    dias_esperados: Number(x.dias_esperados ?? 3), requiere_guia: x.requiere_guia !== false, activo: true, orden: i,
  }))
}

/* Quién sos viene de la app de conteo (persona + depósito en la dirección). Si el nombre no coincide con la lista de Entregas
   (p. ej. «Juan M.»), se devuelve sin operario y la pantalla «¿Quién sos?» de Poli-Entregas lo pide una vez. */
async function resolverQuien(): Promise<{ operador: string; deposito: string } | null> {
  const op = operadorActual(); const dep = depositoActual()
  if (!op || !dep) return null
  // Rápido: si el nombre y el depósito coinciden con la lista conocida, no se espera al servidor para mostrar la pantalla
  // (el servidor igual los valida en cada pedido; si el administrador cambió la lista, el aviso lo muestra la propia pantalla).
  const opOk = CONFIG_DEFAULT.operadores.find((x) => norm(x) === norm(op)); const depOk = CONFIG_DEFAULT.depositos.find((x) => norm(x) === norm(dep))
  if (opOk && depOk) { void cargarConfig({ operador: opOk, deposito: depOk }).catch(() => {}); return { operador: opOk, deposito: depOk } }
  const candOps = [op, ...CONFIG_DEFAULT.operadores.filter((x) => norm(x) === norm(op))]
  const candDeps = [dep, ...CONFIG_DEFAULT.depositos.filter((x) => norm(x) === norm(dep))]
  for (const o of [...new Set(candOps)]) for (const d of [...new Set(candDeps)]) {
    try { await cargarConfig({ operador: o, deposito: d }); return { operador: o, deposito: d } } catch (e) {
      if (!/desconocido/i.test((e as Error).message)) return { operador: op, deposito: dep } // sin conexión o servidor caído: nunca se muestra un login; las pantallas avisan y reintentan
    }
  }
  return null
}

export function crearExpedicionApi(): Api {
  const api: Partial<Api> = {
    async usuarioActual(): Promise<Usuario | null> {
      const q = await resolverQuien()
      const base: Usuario = { id: 'expedicion', email: '', nombre: 'Expedición', rol: 'expedicion', compartida: true, operador: null }
      if (!q) {
        // el nombre de la app de conteo no figura en la lista de Entregas: se olvida acá para que la pantalla «¿Quién sos?» lo pida una vez
        if (operadorActual()) { const { setOperador } = await import('./operador'); setOperador(null) }
        return base
      }
      // el nombre/depósito exactos de la lista de Entregas quedan guardados en este dispositivo
      const { setDeposito, setOperador } = await import('./operador')
      setDeposito(q.deposito); setOperador(q.operador)
      return { ...base, operador: q.operador }
    },
    async iniciarSesion() { throw new ApiError('Expedición no usa usuario y contraseña.') },
    async cerrarSesion() { /* sin sesión */ },
    alCambiarSesion: () => () => {},
    async listarUsuarios() {
      const vistos = new Map<string, Usuario>()
      for (const p of pedidos) if (p.vendedor_email && !vistos.has(p.vendedor_email)) {
        const nombre = p.vendedor_email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        vistos.set(p.vendedor_email, { id: p.vendedor_email, email: p.vendedor_email, nombre, rol: 'vendedor' })
      }
      return [...vistos.values()]
    },
    async listarExpresos() { if (!expresos.length) await cargarConfig(); return expresos },
    async obtenerConfig() { if (configCache === CONFIG_DEFAULT) { try { await cargarConfig() } catch { /* usa lista por defecto */ } } return configCache },
    async guardarConfig() { throw new ApiError('Los ajustes se cambian en Poli-Entregas.') },
    async listarPedidos() {
      // todo lo abierto (sin límite de fecha) + lo movido en los últimos 62 días
      const [hoy, rango] = await Promise.all([pedir('hoy'), pedir('calendario', { desde: haceDias(61), hasta: hoyAR() })])
      const mapa = new Map<string, Pedido>()
      for (const r of [...((rango.pedidos as Array<Record<string, unknown>>) ?? []), ...((hoy.pedidos as Array<Record<string, unknown>>) ?? [])]) mapa.set(String(r.id), aPedido(r))
      pedidos = [...mapa.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
      return pedidos
    },
    async obtenerPedido(idOCodigo: string): Promise<DetallePedido | null> {
      const p = pedidos.find((x) => x.id === idOCodigo || String(x.codigo) === String(idOCodigo))
      if (!p) return null
      try {
        // detalle con historial y archivos (link firmado de 10 minutos que arma el CRM)
        const r = await pedir('pedido', { id: p.id })
        const eventos: Evento[] = ((r.eventos as Array<Record<string, unknown>> | undefined) ?? []).map((e) => ({
          id: Number(e.id), pedido_id: p.id, user_id: null, user_email: (e.user_email as string | null) ?? null, tipo: e.tipo as Evento['tipo'],
          de_estado: (e.de_estado as Estado | null) ?? null, a_estado: (e.a_estado as Estado | null) ?? null, nota: (e.nota as string | null) ?? null,
          datos: (e.datos as Record<string, unknown> | null) ?? null, operador: (e.operador as string | null) ?? null, deposito: (e.deposito as string | null) ?? null, created_at: String(e.created_at ?? ''),
        }))
        const archivos: Archivo[] = ((r.archivos as Array<Record<string, unknown>> | undefined) ?? []).map((a) => {
          if (a.url) urlsArchivos.set(String(a.id), String(a.url))
          return { id: String(a.id), pedido_id: p.id, tipo: a.tipo as Archivo['tipo'], nombre: String(a.nombre ?? 'archivo'), storage_path: '', mime: (a.mime as string | null) ?? null,
            tamano: (a.tamano as number | null) ?? null, subido_por: null, subido_email: null, operador: (a.operador as string | null) ?? null, deposito: (a.deposito as string | null) ?? null, created_at: String(a.created_at ?? '') }
        })
        const fila = (r.pedido as Record<string, unknown> | undefined)
        return { pedido: fila ? { ...p, ...aPedido({ ...fila, vendedor_id: fila.vendedor_id ?? p.vendedor_id }) } : p, eventos, archivos }
      } catch {
        return { pedido: p, eventos: [], archivos: [] } // sin detalle: se ve lo que ya había en la lista
      }
    },
    async buscarDuplicado() { return null },
    async cambiarEstado(id, estado, datos, nota) {
      await pedir('estado', { pedido: id, estado, datos: datos ?? {}, nota: nota ?? '' })
    },
    async telefonoCliente() { return null },
    async eventosRecientes() { return [] },
    async urlArchivo(archivo: Archivo) { const u = urlsArchivos.get(archivo.id); if (!u) throw new ApiError('El link del archivo venció. Volvé a abrir el pedido.'); return u },
    escuchar(cb) { const t = setInterval(cb, 45000); return () => clearInterval(t) },
    listarRoles: async () => [],
    asignarRol: noDisponible('Cambiar roles'),
    guardarExpreso: noDisponible('Editar expresos'),
    crearPedido: noDisponible('Cargar un remito'),
    async editarPedido(_id, campos) {
      // Solo el N° de guía llega acá (después de subir la guía): viajó con el archivo y el CRM lo guarda en el pedido si estaba vacío (21/11).
      if (Object.keys(campos).every((k) => k === 'n_guia')) return
      throw new ApiError('Editar el pedido todavía no está disponible desde expedición. Se hace en Poli-Entregas.')
    },
    comentar: noDisponible('Comentar'),
    async subirArchivo(pedidoId: string, tipo: TipoArchivo, archivo: File) {
      // Guía: se lee el N° antes de subir (va guardado con el archivo; el CRM no deja editar el pedido desde expedición)
      let n_guia: string | null = null; let texto = ''
      if (tipo === 'guia') {
        try { const { detectarGuia } = await import('./leerGuia'); n_guia = (await detectarGuia(archivo))?.numero ?? null } catch { /* sin número */ }
      }
      if (/pdf$/i.test(archivo.type) || /\.pdf$/i.test(archivo.name)) { try { const { extraerTextoPdf } = await import('./pdfText'); texto = await extraerTextoPdf(archivo) } catch { /* sin texto */ } }
      await subirYRegistrar(archivo, tipo, { pedido: pedidoId, texto, n_guia })
    },
    borrarArchivo: noDisponible('Borrar un archivo'),
  }
  return api as Api
}

/* ---------- 1b: subir guías y remitos (contrato del CRM, 21/11) ----------
   1) subir-url: el CRM da un link firmado para subir UN archivo (15 MB, PDF o foto) a su almacenamiento.
   2) PUT del archivo a ese link (directo desde el celular, no pasa por la función).
   3) registrar-archivo: con el pedido elegido, o sin pedido (pedido null): el CRM empareja con el texto leído
      (remito nuestro, CUIT o teléfono, y solo si hay UN pedido); si no, queda «sin asignar» con candidatos. */
const TIPOS_SUBIDA: TipoArchivo[] = ['guia', 'remito', 'remito_firmado']
const MIMES_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
function mimeDe(f: File): string {
  const t = (f.type || '').toLowerCase()
  if (MIMES_OK.includes(t)) return t
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  return ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' } as Record<string, string>)[ext] || t
}

export interface Candidato { pedido: string; codigo: number | null; cliente: string; por: string; por_texto: string }
export interface ResultadoRegistro { archivo_id: string; asignado_a: string | null; candidatos: Candidato[]; n_guia: string | null; bultos: number | null; repetido?: boolean }
export interface ArchivoSinAsignar { id: string; tipo: TipoArchivo; nombre: string; mime: string | null; tamano: number | null; n_guia: string | null; candidatos: Candidato[]; operador: string | null; deposito: string | null; created_at: string; url: string | null }

/** Archivos ya subidos en esta sesión, por si el registro falló y se reintenta. */
const yaSubidos = new WeakMap<File, string>()

export async function subirYRegistrar(archivo: File, tipo: TipoArchivo, extra: { pedido: string | null; texto?: string; n_guia?: string | null; nota?: string }): Promise<ResultadoRegistro> {
  if (!TIPOS_SUBIDA.includes(tipo)) throw new ApiError('Desde expedición se suben guías, remitos y remitos firmados.')
  const mime = mimeDe(archivo)
  if (!MIMES_OK.includes(mime)) throw new ApiError(`«${archivo.name}»: usá PDF o foto (JPG, PNG, WEBP, HEIC).`)
  if (archivo.size > 15 * 1024 * 1024) throw new ApiError(`«${archivo.name}» pesa más de 15 MB.`)
  // Si el archivo ya se subió y lo que falló fue el registro, al reintentar se registra el mismo (no se sube otra copia).
  let path = yaSubidos.get(archivo) ?? ''
  if (!path) {
    const u = await pedir('subir-url', { nombre: archivo.name.slice(0, 120), mime, bytes: archivo.size, tipo })
    const url = String(u.url || ''); path = String(u.path || '')
    if (!url || !path) throw new ApiError('El CRM no dio el link para subir.')
    let r: Response
    try { r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: archivo, signal: AbortSignal.timeout(120000) }) } catch (e) {
      throw new ApiError((e as Error)?.name === 'TimeoutError' ? `«${archivo.name}» tardó demasiado en subir (señal floja). Probá de nuevo.` : 'Se cortó la subida. Revisá internet y probá de nuevo.')
    }
    if (!r.ok) throw new ApiError(`No se pudo subir «${archivo.name}» (${r.status}).`)
    yaSubidos.set(archivo, path)
  }
  const g = await pedir('registrar-archivo', { path, tipo, pedido: extra.pedido, nombre: archivo.name.slice(0, 120), texto: (extra.texto || '').slice(0, 20000), n_guia: extra.n_guia || null, ...(extra.nota ? { nota: extra.nota.slice(0, 500) } : {}) })
  return { archivo_id: String(g.archivo_id ?? ''), asignado_a: (g.asignado_a as string | null) ?? null, candidatos: (g.candidatos as Candidato[] | undefined) ?? [], n_guia: (g.n_guia as string | null) ?? null, bultos: (g.bultos as number | null) ?? null, repetido: !!g.repetido }
}

export async function listarSinAsignar(): Promise<ArchivoSinAsignar[]> {
  const r = await pedir('sin-asignar')
  return ((r.archivos as ArchivoSinAsignar[] | undefined) ?? []).map((a) => ({ ...a, candidatos: a.candidatos ?? [] }))
}

export async function asignarArchivo(archivo_id: string, pedido: string): Promise<void> {
  await pedir('asignar', { archivo_id, pedido })
}
