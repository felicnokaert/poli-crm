import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SinAcceso, type Api } from './api'
import { sha256Hex } from './hash'
import { avisarSinSesionAlCrm, isEmbeddedInCrm } from './embed'
import { headerDeposito, headerOperador } from './operador'
import { CONFIG_DEFAULT, type Archivo, type Config, type Evento, type Expreso, type Pedido, type Rol, type RolAsignado, type Usuario } from './types'

const BUCKET = 'entregas'

function nombreSeguro(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
  return limpio.slice(-80) || 'archivo'
}

function lanzar(error: unknown): never {
  throw error
}

export function crearSupabaseApi(): Api & { client: SupabaseClient } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el entorno.')
  // Las llamadas a la API de datos llevan el nombre de quién usa la cuenta compartida de expedición y el depósito.
  const fetchConOperador: typeof fetch = (input, init) => {
    const op = headerOperador()
    const dep = headerDeposito()
    const destino = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if ((!op && !dep) || !destino.includes('/rest/v1/')) return fetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (op) headers.set('x-operador', op)
    if (dep) headers.set('x-deposito', dep)
    return fetch(input, { ...init, headers })
  }
  // Dentro del CRM la sesión la maneja el CRM (ver embed.ts): acá ni se guarda ni se renueva.
  const embebido = typeof window !== 'undefined' && isEmbeddedInCrm()
  const sb = createClient(url, anonKey, {
    global: { fetch: fetchConOperador },
    ...(embebido ? { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } : {}),
  })

  async function subir(pedidoId: string, tipo: string, archivo: File, hash?: string | null) {
    const path = `${pedidoId}/${tipo}-${Date.now()}-${nombreSeguro(archivo.name)}`
    const { error: errSubida } = await sb.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type || undefined, upsert: false })
    if (errSubida) lanzar(errSubida)
    const { data: auth } = await sb.auth.getUser()
    const { error } = await sb.from('entregas_archivos').insert({
      pedido_id: pedidoId, tipo, nombre: archivo.name, storage_path: path, mime: archivo.type || null, tamano: archivo.size,
      hash: hash ?? null, subido_por: auth.user?.id,
    })
    if (error) {
      await sb.storage.from(BUCKET).remove([path])
      lanzar(error)
    }
  }

  return {
    client: sb,

    async usuarioActual() {
      const { data } = await sb.auth.getUser()
      if (!data.user) {
        if (embebido) avisarSinSesionAlCrm()
        return null
      }
      const email = (data.user.email ?? '').toLowerCase()
      // Las tres consultas a la vez (25/11: antes una detrás de otra, y se veía «Cargando…» más tiempo).
      const [{ data: rol, error }, { data: lista }, { data: fila }] = await Promise.all([
        sb.rpc('entregas_mi_rol'),
        sb.rpc('entregas_usuarios'),
        sb.from('entregas_roles').select('compartida').eq('email', email).maybeSingle(),
      ])
      if (error) lanzar(error)
      if (!rol) throw new SinAcceso(email)
      const yo = (lista as Usuario[] | null)?.find((u) => u.id === data.user!.id)
      return { id: data.user.id, email, nombre: yo?.nombre ?? email.split('@')[0], rol: rol as Rol, compartida: Boolean(fila?.compartida) }
    },

    async iniciarSesion(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(/invalid login/i.test(error.message) ? 'Email o contraseña incorrectos.' : error.message)
    },

    async recibirSesion(accessToken, refreshToken) {
      const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (error) lanzar(error)
    },

    async cerrarSesion() {
      await sb.auth.signOut({ scope: 'local' })
    },

    alCambiarSesion(cb) {
      const { data } = sb.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') cb()
      })
      return () => data.subscription.unsubscribe()
    },

    async listarUsuarios() {
      const { data, error } = await sb.rpc('entregas_usuarios')
      if (error) lanzar(error)
      return (data ?? []) as Usuario[]
    },

    async listarExpresos() {
      const { data, error } = await sb.from('entregas_expresos').select('*').order('orden').order('nombre')
      if (error) lanzar(error)
      return (data ?? []) as Expreso[]
    },

    async guardarExpreso(expreso) {
      const fila = {
        nombre: expreso.nombre.trim(),
        tracking_url: expreso.tracking_url?.trim() || null,
        dias_esperados: expreso.dias_esperados ?? 5,
        requiere_guia: expreso.requiere_guia ?? true,
        activo: expreso.activo ?? true,
        orden: expreso.orden ?? 0,
      }
      const q = expreso.id
        ? sb.from('entregas_expresos').update(fila).eq('id', expreso.id).select().single()
        : sb.from('entregas_expresos').insert(fila).select().single()
      const { data, error } = await q
      if (error) lanzar(error)
      return data as Expreso
    },

    async obtenerConfig() {
      const { data, error } = await sb.from('entregas_config').select('*').eq('id', 1).maybeSingle()
      if (error) lanzar(error)
      return { ...CONFIG_DEFAULT, ...(data ?? {}) } as Config
    },

    async guardarConfig(config) {
      const { horas_sin_imprimir, dias_sin_despachar, dias_bloqueado, operadores, depositos } = config
      const { error } = await sb.from('entregas_config')
        .update({ horas_sin_imprimir, dias_sin_despachar, dias_bloqueado, operadores, depositos, updated_at: new Date().toISOString() }).eq('id', 1)
      if (error) lanzar(error)
    },

    async listarRoles() {
      const { data, error } = await sb.from('entregas_roles').select('email, rol, nombre, compartida').order('email')
      if (error) lanzar(error)
      return (data ?? []) as RolAsignado[]
    },

    async asignarRol(email, rol, nombre) {
      const e = email.trim().toLowerCase()
      if (!rol) {
        const { error } = await sb.from('entregas_roles').delete().eq('email', e)
        if (error) lanzar(error)
        return
      }
      const { error } = await sb.from('entregas_roles').upsert({ email: e, rol, nombre: nombre?.trim() || null, updated_at: new Date().toISOString() })
      if (error) lanzar(error)
    },

    async listarPedidos() {
      // Todo lo abierto + lo cerrado de los últimos 400 días (alcanza para comparar meses y años).
      const corte = new Date(Date.now() - 400 * 86_400_000).toISOString()
      const { data, error } = await sb
        .from('entregas_pedidos_vista')
        .select('*')
        .or(`estado.not.in.(entregado,cancelado),created_at.gte.${corte}`)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) lanzar(error)
      return (data ?? []) as Pedido[]
    },

    async obtenerPedido(idOCodigo) {
      const porCodigo = /^\d+$/.test(idOCodigo)
      const { data: pedido, error } = await sb
        .from('entregas_pedidos_vista')
        .select('*')
        .eq(porCodigo ? 'codigo' : 'id', porCodigo ? Number(idOCodigo) : idOCodigo)
        .maybeSingle()
      if (error) lanzar(error)
      if (!pedido) return null
      const [ev, ar] = await Promise.all([
        sb.from('entregas_eventos').select('*').eq('pedido_id', pedido.id).order('created_at', { ascending: true }),
        sb.from('entregas_archivos').select('*').eq('pedido_id', pedido.id).order('created_at', { ascending: true }),
      ])
      if (ev.error) lanzar(ev.error)
      if (ar.error) lanzar(ar.error)
      return { pedido: pedido as Pedido, eventos: (ev.data ?? []) as Evento[], archivos: (ar.data ?? []) as Archivo[] }
    },

    async buscarDuplicado(nRemito, hash) {
      const filtros = [`n_remito.eq.${nRemito.toUpperCase()}`]
      if (hash) filtros.push(`remito_hash.eq.${hash}`)
      const { data, error } = await sb
        .from('entregas_pedidos_vista')
        .select('*')
        .neq('estado', 'cancelado')
        .or(filtros.join(','))
        .limit(1)
      if (error) lanzar(error)
      return ((data ?? [])[0] as Pedido) ?? null
    },

    async crearPedido(datos, remito, vendedorId) {
      const { data: auth } = await sb.auth.getUser()
      const { data, error } = await sb
        .from('entregas_pedidos')
        .insert({ ...datos, vendedor_id: vendedorId ?? auth.user?.id })
        .select('id')
        .single()
      if (error) lanzar(error)
      if (remito) await subir(data.id, 'remito', remito, datos.remito_hash ?? (await sha256Hex(remito)))
      const creado = await this.obtenerPedido(data.id)
      return creado!.pedido
    },

    async cambiarEstado(id, estado, datos = {}, nota = null) {
      const { error } = await sb.rpc('entregas_cambiar_estado', { p_pedido: id, p_estado: estado, p_datos: datos, p_nota: nota })
      if (error) lanzar(error)
    },

    async editarPedido(id, campos) {
      const { error } = await sb.rpc('entregas_editar', { p_pedido: id, p_campos: campos })
      if (error) lanzar(error)
    },

    async comentar(id, texto) {
      const { data: auth } = await sb.auth.getUser()
      const { error } = await sb.from('entregas_eventos').insert({ pedido_id: id, tipo: 'comentario', nota: texto.trim(), user_id: auth.user?.id })
      if (error) lanzar(error)
    },

    async subirArchivo(pedidoId, tipo, archivo) {
      await subir(pedidoId, tipo, archivo)
    },

    async urlArchivo(archivo) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(archivo.storage_path, 60 * 30)
      if (error) lanzar(error)
      return data.signedUrl
    },

    async borrarArchivo(archivo) {
      const { error } = await sb.from('entregas_archivos').delete().eq('id', archivo.id)
      if (error) lanzar(error)
      await sb.storage.from(BUCKET).remove([archivo.storage_path])
    },

    async telefonoCliente(cuit, razonSocial) {
      try {
        let q = sb.from('contabilium_clientes').select('telefono').not('telefono', 'is', null).limit(1)
        q = cuit ? q.eq('cuit', cuit) : q.ilike('razon_social', razonSocial.trim())
        const { data } = await q
        const tel = (data?.[0] as { telefono?: string } | undefined)?.telefono?.trim()
        return tel || null
      } catch {
        return null
      }
    },

    async eventosRecientes(desde) {
      const { data, error } = await sb.from('entregas_eventos').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(300)
      if (error) lanzar(error)
      return (data ?? []) as Evento[]
    },

    escuchar(cb) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const avisar = () => {
        clearTimeout(timer)
        timer = setTimeout(cb, 400)
      }
      const canal = sb
        .channel(`entregas-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas_pedidos' }, avisar)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entregas_eventos' }, avisar)
        .subscribe()
      return () => {
        clearTimeout(timer)
        void sb.removeChannel(canal)
      }
    },
  }
}
