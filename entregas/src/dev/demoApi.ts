// Maqueta: la app completa con datos de ejemplo guardados en el navegador, sin tocar la base real.
// Se usa con `npm run maqueta`. Valida las transiciones con la misma regla que la base (estados.ts).
import type { Api, DetallePedido } from '../lib/api'
import { puedeTransicionar } from '../lib/estados'
import { aISO, hoyISO } from '../lib/fechas'
import { depositoActual, operadorActual } from '../lib/operador'
import {
  CONFIG_DEFAULT, type Archivo, type Config, type Estado, type Evento, type Expreso, type Pedido, type Rol, type Usuario,
} from '../lib/types'

const CLAVE = 'poli-entregas-maqueta-v2'

interface Estado_ {
  usuarioId: string | null
  usuarios: Usuario[]
  expresos: Expreso[]
  config: Config
  pedidos: Omit<Pedido, 'tiene_guia_archivo' | 'tiene_comprobante' | 'archivos' | 'ultima_actividad'>[]
  eventos: Evento[]
  archivos: Archivo[]
  seq: number
}

const USUARIOS: Usuario[] = [
  { id: 'u-felipe', email: 'felipe@grupopoliplast.com.ar', nombre: 'Felipe', rol: 'admin' },
  { id: 'u-juan', email: 'juan@grupopoliplast.com.ar', nombre: 'Juan', rol: 'vendedor' },
  { id: 'u-brenda', email: 'brenda@grupopoliplast.com.ar', nombre: 'Brenda', rol: 'vendedor' },
  { id: 'u-exp', email: 'expedicion@grupopoliplast.com.ar', nombre: 'Expedición', rol: 'expedicion', compartida: true },
]

const EXPRESOS: Expreso[] = [
  { id: 'x-via', nombre: 'Via Cargo', tracking_url: 'https://viacargo.com.ar/seguimiento-de-envio/', dias_esperados: 5, requiere_guia: true, activo: true, orden: 1 },
  { id: 'x-cred', nombre: 'Credifin', tracking_url: 'https://credifin.com.ar/seguimiento/', dias_esperados: 5, requiere_guia: true, activo: true, orden: 2 },
  { id: 'x-full', nombre: 'Full Pack', tracking_url: null, dias_esperados: 5, requiere_guia: true, activo: true, orden: 3 },
  { id: 'x-retira', nombre: 'Retira el cliente', tracking_url: null, dias_esperados: 0, requiere_guia: false, activo: true, orden: 9 },
]

function haceHoras(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}
function haceDias(d: number): string {
  const f = new Date(); f.setDate(f.getDate() - d)
  return aISO(f)
}

function semilla(): Estado_ {
  const base = {
    fecha_remito: null, cuit: null, cp: null, contacto: null, nota: null, impreso_at: null, bloqueo_motivo: null, bloqueo_detalle: null,
    stock_estimado: null, fecha_despacho: null, n_guia: null, bultos: null, fecha_entrega: null, incidencia_motivo: null,
    incidencia_detalle: null, items: [], remito_hash: null,
  } as const
  const filas: [number, string, string, string, string, string, Estado, number, Partial<Pedido>][] = [
    [1, '0006-00012401', 'CONSTRUCTORA DEL SUR SRL', 'Rosario', 'Santa Fe', 'x-via', 'cargado', 2, { vendedor_id: 'u-juan', telefono: '341 555-1234' }],
    [2, '0006-00012399', 'IMPERMEABILIZACIONES NORTE', 'Salta', 'Salta', 'x-cred', 'cargado', 30, { vendedor_id: 'u-brenda', telefono: '387 444-2211' }],
    [3, '0013-00005810', 'FERRETERIA LOS ANDES', 'Mendoza', 'Mendoza', 'x-full', 'impreso', 20, { vendedor_id: 'u-juan', impreso_at: haceHoras(18) }],
    [4, '0006-00012380', 'PINTURERIA CENTRO', 'Córdoba', 'Córdoba', 'x-via', 'impreso', 80, { vendedor_id: 'u-brenda', impreso_at: haceHoras(78) }],
    [5, '0013-00005799', 'ESTEBAN JOSE SARTORI', 'Pehuajó', 'Buenos Aires', 'x-cred', 'bloqueado', 50, { vendedor_id: 'u-juan', bloqueo_motivo: 'sin_stock', stock_estimado: haceDias(-3), bloqueo_detalle: 'Falta Poli-Plus 740 x 25 kg' }],
    [6, '0006-00012350', 'LACUS LATINA S.A.', 'Berazategui', 'Buenos Aires', 'x-via', 'bloqueado', 120, { vendedor_id: 'u-brenda', bloqueo_motivo: 'falta_pago' }],
    [7, '0006-00012320', 'AISLACIONES PATAGONIA', 'Neuquén', 'Neuquén', 'x-via', 'despachado', 70, { vendedor_id: 'u-juan', fecha_despacho: haceDias(2), n_guia: '000123456789', bultos: 3, impreso_at: haceHoras(72) }],
    [8, '0006-00012300', 'TECHOS DEL LITORAL', 'Paraná', 'Entre Ríos', 'x-full', 'despachado', 240, { vendedor_id: 'u-brenda', fecha_despacho: haceDias(10), bultos: 2, impreso_at: haceHoras(250) }],
    [9, '0013-00005750', 'OBRAS Y PROYECTOS SA', 'Tucumán', 'Tucumán', 'x-cred', 'entregado', 300, { vendedor_id: 'u-juan', fecha_despacho: haceDias(12), fecha_entrega: haceDias(7), n_guia: 'CR-88412', bultos: 1, impreso_at: haceHoras(310) }],
    [10, '0006-00012250', 'DISTRIBUIDORA OESTE', 'San Luis', 'San Luis', 'x-via', 'entregado', 400, { vendedor_id: 'u-brenda', fecha_despacho: haceDias(16), fecha_entrega: haceDias(12), n_guia: '000123400001', impreso_at: haceHoras(410) }],
    [11, '0006-00012210', 'CORRALON SAN MARTIN', 'Bahía Blanca', 'Buenos Aires', 'x-full', 'incidencia', 200, { vendedor_id: 'u-juan', fecha_despacho: haceDias(6), incidencia_motivo: 'direccion', incidencia_detalle: 'El expreso dice que la dirección no existe', impreso_at: haceHoras(205) }],
    [12, '0006-00012405', 'CLIENTE MOSTRADOR', 'CABA', 'CABA', 'x-retira', 'impreso', 3, { vendedor_id: 'u-brenda', impreso_at: haceHoras(1) }],
  ]
  const pedidos = filas.map(([codigo, n_remito, cliente, localidad, provincia, expreso_id, estado, horas, extra]) => ({
    ...base,
    id: `p-${codigo}`,
    codigo,
    n_remito,
    cliente,
    localidad,
    provincia,
    direccion: 'Av. Siempreviva 742',
    telefono: '11 5555-0000',
    expreso_id,
    vendedor_id: 'u-juan',
    vendedor_email: null,
    estado,
    created_at: haceHoras(horas),
    updated_at: haceHoras(Math.max(0, horas - 1)),
    estado_desde: haceHoras(Math.max(0, Math.round(horas / 3))),
    items: [{ cantidad: 2, codigo: '740T', descripcion: 'POLI-PLUS 740 IR' }, { cantidad: 1, codigo: 'ISO PM', descripcion: 'TAM ISO PM' }],
    ...extra,
  })) as Estado_['pedidos']
  pedidos.forEach((p) => { p.vendedor_email = USUARIOS.find((u) => u.id === p.vendedor_id)?.email ?? null })
  let idEv = 1
  const eventos: Evento[] = pedidos.flatMap((p) => {
    const evs: Evento[] = [{ id: idEv++, pedido_id: p.id, user_id: p.vendedor_id, user_email: p.vendedor_email, tipo: 'alta', de_estado: null, a_estado: 'cargado', nota: null, datos: null, created_at: p.created_at }]
    if (p.estado !== 'cargado') evs.push({ id: idEv++, pedido_id: p.id, user_id: 'u-exp', user_email: 'expedicion@grupopoliplast.com.ar', tipo: 'estado', de_estado: 'cargado', a_estado: p.estado, nota: null, datos: null, created_at: p.estado_desde })
    return evs
  })
  return { usuarioId: null, usuarios: USUARIOS, expresos: EXPRESOS, config: { ...CONFIG_DEFAULT, operadores: [...CONFIG_DEFAULT.operadores], depositos: [...CONFIG_DEFAULT.depositos] }, pedidos, eventos, archivos: [], seq: 100 }
}

function cargar(): Estado_ {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (raw) return JSON.parse(raw) as Estado_
  } catch { /* sin storage */ }
  return semilla()
}

export function crearDemoApi(): Api {
  let db = cargar()
  const urls = new Map<string, string>()
  const oyentes = new Set<() => void>()
  const oyentesSesion = new Set<() => void>()

  const guardar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify(db)) } catch { /* sin storage */ }
    oyentes.forEach((cb) => setTimeout(cb, 50))
  }
  const yo = () => db.usuarios.find((u) => u.id === db.usuarioId) ?? null
  const exigir = () => {
    const u = yo()
    if (!u) throw new Error('Sin sesión')
    return u
  }
  const vista = (p: Estado_['pedidos'][number]): Pedido => {
    const archivos = db.archivos.filter((a) => a.pedido_id === p.id)
    const evs = db.eventos.filter((e) => e.pedido_id === p.id)
    const desp = [...evs].reverse().find((e) => e.tipo === 'estado' && e.a_estado === 'despachado')
    return {
      ...p,
      despacho_operador: desp?.operador ?? null,
      despacho_deposito: desp?.deposito ?? null,
      despacho_user_id: desp?.user_id ?? null,
      despacho_email: desp?.user_email ?? null,
      despacho_at: desp?.created_at ?? null,
      tiene_guia_archivo: archivos.some((a) => a.tipo === 'guia'),
      tiene_comprobante: archivos.some((a) => a.tipo === 'remito_firmado'),
      archivos: archivos.length,
      ultima_actividad: evs.length ? evs[evs.length - 1].created_at : null,
    }
  }
  // Como en la base: el operador solo cuenta para la cuenta compartida.
  const operador = () => (yo()?.compartida ? operadorActual() : null)
  const deposito = () => {
    const d = depositoActual()
    return yo()?.rol !== 'vendedor' && d && (db.config.depositos ?? CONFIG_DEFAULT.depositos).includes(d) ? d : null
  }
  const evento = (e: Omit<Evento, 'id' | 'created_at' | 'user_id' | 'user_email'>) => {
    const u = exigir()
    db.eventos.push({ ...e, id: ++db.seq, user_id: u.id, user_email: u.email, operador: operador(), deposito: deposito(), created_at: new Date().toISOString() })
  }
  const demora = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))

  const api: Api = {
    usuariosDePrueba: USUARIOS,
    async usuarioActual() { return demora(yo()) },
    async iniciarSesion(email) {
      const u = db.usuarios.find((x) => x.email === email.trim().toLowerCase())
      if (!u) throw new Error('Usuario de prueba inexistente')
      db.usuarioId = u.id
      guardar()
      oyentesSesion.forEach((cb) => cb())
    },
    async cerrarSesion() { db.usuarioId = null; guardar(); oyentesSesion.forEach((cb) => cb()) },
    alCambiarSesion(cb) { oyentesSesion.add(cb); return () => oyentesSesion.delete(cb) },
    async listarUsuarios() { return demora(db.usuarios) },
    async listarExpresos() { return demora([...db.expresos].sort((a, b) => a.orden - b.orden)) },
    async guardarExpreso(e) {
      if (exigir().rol !== 'admin') throw new Error('No tenés permiso para hacer esto.')
      const existente = e.id ? db.expresos.find((x) => x.id === e.id) : undefined
      const fila: Expreso = { id: e.id ?? `x-${++db.seq}`, nombre: e.nombre, tracking_url: e.tracking_url ?? null, dias_esperados: e.dias_esperados ?? 5, requiere_guia: e.requiere_guia ?? true, activo: e.activo ?? true, orden: e.orden ?? 0 }
      if (existente) Object.assign(existente, fila)
      else db.expresos.push(fila)
      guardar()
      return fila
    },
    async obtenerConfig() { return demora({ ...CONFIG_DEFAULT, ...db.config }) },
    async guardarConfig(c) { db.config = c; guardar() },
    async listarRoles() {
      return demora(db.usuarios.filter((u) => u.rol !== 'vendedor').map((u) => ({ email: u.email, rol: u.rol, nombre: u.nombre, compartida: Boolean(u.compartida) })))
    },
    async asignarRol(email, rol, nombre) {
      const e = email.trim().toLowerCase()
      const u = db.usuarios.find((x) => x.email === e)
      if (u && rol) { u.rol = rol; if (nombre) u.nombre = nombre }
      else if (!u && rol) db.usuarios.push({ id: `u-${++db.seq}`, email: e, nombre: nombre || e.split('@')[0], rol })
      else if (u && !rol) u.rol = 'vendedor'
      guardar()
    },
    async listarPedidos() { return demora(db.pedidos.map(vista)) },
    async obtenerPedido(idOCodigo) {
      const p = db.pedidos.find((x) => x.id === idOCodigo || String(x.codigo) === idOCodigo)
      if (!p) return demora(null)
      const detalle: DetallePedido = {
        pedido: vista(p),
        eventos: db.eventos.filter((e) => e.pedido_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
        archivos: db.archivos.filter((a) => a.pedido_id === p.id),
      }
      return demora(detalle)
    },
    async buscarDuplicado(n, hash) {
      const p = db.pedidos.find((x) => x.estado !== 'cancelado' && (x.n_remito === n.toUpperCase() || (hash && x.remito_hash === hash)))
      return demora(p ? vista(p) : null)
    },
    async crearPedido(datos, remito, vendedorId) {
      const u = exigir()
      if (db.pedidos.some((x) => x.estado !== 'cancelado' && x.n_remito === datos.n_remito.toUpperCase())) throw new Error('Ese número de remito ya está cargado y en curso.')
      const ahora = new Date().toISOString()
      const codigo = Math.max(0, ...db.pedidos.map((x) => x.codigo)) + 1
      const vendedor = db.usuarios.find((x) => x.id === (vendedorId ?? u.id)) ?? u
      const p: Estado_['pedidos'][number] = {
        ...datos, n_remito: datos.n_remito.toUpperCase(), id: `p-${codigo}-${Date.now()}`, codigo, vendedor_id: vendedor.id, vendedor_email: vendedor.email,
        estado: 'cargado', estado_desde: ahora, impreso_at: null, bloqueo_motivo: null, bloqueo_detalle: null, stock_estimado: null,
        fecha_despacho: null, n_guia: null, bultos: null, fecha_entrega: null, incidencia_motivo: null, incidencia_detalle: null,
        created_at: ahora, updated_at: ahora, operador: operador(),
      }
      db.pedidos.unshift(p)
      evento({ pedido_id: p.id, tipo: 'alta', de_estado: null, a_estado: 'cargado', nota: datos.nota, datos: null })
      if (remito) await api.subirArchivo(p.id, 'remito', remito)
      guardar()
      return vista(p)
    },
    async cambiarEstado(id, estado, datos = {}, nota = null) {
      const u = exigir()
      const p = db.pedidos.find((x) => x.id === id)
      if (!p) throw new Error('Pedido inexistente')
      const de = p.estado
      if (!puedeTransicionar(de, estado, u.rol as Rol, p.vendedor_id === u.id)) throw new Error(`No podés pasar este pedido de ${de} a ${estado}`)
      if (estado !== 'bloqueado') { p.bloqueo_motivo = null; p.bloqueo_detalle = null; p.stock_estimado = null }
      if (estado !== 'incidencia' && estado !== 'entregado') { p.incidencia_motivo = null; p.incidencia_detalle = null }
      if (estado === 'impreso') p.impreso_at = p.impreso_at ?? new Date().toISOString()
      if (estado === 'cargado' && de === 'impreso') p.impreso_at = null
      if (estado === 'bloqueado') {
        if (!datos.bloqueo_motivo) throw new Error('Falta el motivo')
        p.bloqueo_motivo = datos.bloqueo_motivo; p.bloqueo_detalle = datos.bloqueo_detalle ?? null; p.stock_estimado = datos.stock_estimado ?? null
      }
      if (estado === 'despachado') {
        p.fecha_despacho = datos.fecha_despacho ?? hoyISO()
        if ('n_guia' in datos) p.n_guia = datos.n_guia || null
        if ('bultos' in datos) p.bultos = datos.bultos ?? null
        if (datos.expreso_id) p.expreso_id = datos.expreso_id
        p.impreso_at = p.impreso_at ?? new Date().toISOString()
        p.fecha_entrega = null
      }
      if (estado === 'entregado') p.fecha_entrega = datos.fecha_entrega ?? hoyISO()
      if (estado === 'incidencia') {
        if (!datos.incidencia_motivo) throw new Error('Falta el motivo')
        p.incidencia_motivo = datos.incidencia_motivo; p.incidencia_detalle = datos.incidencia_detalle ?? null
      }
      p.estado = estado
      p.estado_desde = new Date().toISOString()
      p.updated_at = p.estado_desde
      evento({ pedido_id: id, tipo: 'estado', de_estado: de, a_estado: estado, nota: nota || null, datos: Object.keys(datos).length ? (datos as Record<string, unknown>) : null })
      guardar()
    },
    async editarPedido(id, campos) {
      exigir()
      const p = db.pedidos.find((x) => x.id === id)
      if (!p) throw new Error('Pedido inexistente')
      const cambios: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(campos)) {
        const antes = (p as Record<string, unknown>)[k]
        if (antes !== v) { cambios[k] = { antes, despues: v }; (p as Record<string, unknown>)[k] = v }
      }
      if (Object.keys(cambios).length) {
        p.updated_at = new Date().toISOString()
        evento({ pedido_id: id, tipo: 'edicion', de_estado: null, a_estado: null, nota: null, datos: cambios })
        guardar()
      }
    },
    async comentar(id, texto) {
      evento({ pedido_id: id, tipo: 'comentario', de_estado: null, a_estado: null, nota: texto.trim(), datos: null })
      guardar()
    },
    async subirArchivo(pedidoId, tipo, archivo) {
      const u = exigir()
      const a: Archivo = { id: `a-${++db.seq}`, pedido_id: pedidoId, tipo, nombre: archivo.name, storage_path: `${pedidoId}/${archivo.name}`, mime: archivo.type, tamano: archivo.size, subido_por: u.id, subido_email: u.email, operador: operador(), deposito: deposito(), created_at: new Date().toISOString() }
      urls.set(a.id, URL.createObjectURL(archivo))
      db.archivos.push(a)
      evento({ pedido_id: pedidoId, tipo: 'archivo', de_estado: null, a_estado: null, nota: null, datos: { accion: 'subio', tipo, nombre: archivo.name } })
      guardar()
    },
    async urlArchivo(a) {
      const url = urls.get(a.id)
      if (!url) throw new Error('En la maqueta los archivos se pierden al recargar la página.')
      return url
    },
    async borrarArchivo(a) {
      db.archivos = db.archivos.filter((x) => x.id !== a.id)
      evento({ pedido_id: a.pedido_id, tipo: 'archivo', de_estado: null, a_estado: null, nota: null, datos: { accion: 'borro', tipo: a.tipo, nombre: a.nombre } })
      guardar()
    },
    async telefonoCliente() { return null },
    async eventosRecientes(desde) { return demora(db.eventos.filter((e) => e.created_at >= desde).sort((a, b) => b.created_at.localeCompare(a.created_at))) },
    escuchar(cb) { oyentes.add(cb); return () => oyentes.delete(cb) },
  }

  // Para reiniciar los datos de ejemplo desde la consola: window.reiniciarMaqueta()
  ;(window as unknown as { reiniciarMaqueta: () => void }).reiniciarMaqueta = () => {
    localStorage.removeItem(CLAVE)
    db = semilla()
    location.reload()
  }
  return api
}
