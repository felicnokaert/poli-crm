import type {
  Archivo, CamposEditables, Config, DatosCambio, Estado, Evento, Expreso, NuevoPedido, Pedido, Rol, RolAsignado, TipoArchivo, Usuario,
} from './types'

export interface DetallePedido {
  pedido: Pedido
  eventos: Evento[]
  archivos: Archivo[]
}

export interface Api {
  /** Usuario logueado con su rol en Entregas (null = no tiene acceso). */
  usuarioActual(): Promise<Usuario | null>
  iniciarSesion(email: string, password: string): Promise<void>
  /** Pestaña del CRM: usa la sesión que manda el CRM. */
  recibirSesion?(accessToken: string, refreshToken: string): Promise<void>
  cerrarSesion(): Promise<void>
  /** Avisa cuando se inicia o cierra sesión. */
  alCambiarSesion(cb: () => void): () => void
  /** Solo en maqueta: lista de usuarios de prueba para entrar con un clic. */
  usuariosDePrueba?: Usuario[]
  listarUsuarios(): Promise<Usuario[]>
  listarExpresos(): Promise<Expreso[]>
  guardarExpreso(expreso: Partial<Expreso> & { nombre: string }): Promise<Expreso>
  obtenerConfig(): Promise<Config>
  guardarConfig(config: Config): Promise<void>
  /** Roles cargados a mano (incluye cuentas que todavía no entraron nunca). */
  listarRoles(): Promise<RolAsignado[]>
  asignarRol(email: string, rol: Rol | null, nombre?: string | null): Promise<void>

  listarPedidos(): Promise<Pedido[]>
  obtenerPedido(idOCodigo: string): Promise<DetallePedido | null>
  /** Busca un pedido vivo con el mismo número de remito o el mismo archivo. */
  buscarDuplicado(nRemito: string, hash: string | null): Promise<Pedido | null>
  crearPedido(datos: NuevoPedido, remito: File | null, vendedorId?: string): Promise<Pedido>
  cambiarEstado(id: string, estado: Estado, datos?: DatosCambio, nota?: string | null): Promise<void>
  editarPedido(id: string, campos: CamposEditables): Promise<void>
  comentar(id: string, texto: string): Promise<void>
  subirArchivo(pedidoId: string, tipo: TipoArchivo, archivo: File): Promise<void>
  urlArchivo(archivo: Archivo): Promise<string>
  borrarArchivo(archivo: Archivo): Promise<void>
  /** Teléfono del cliente según la base de Contabilium del CRM (si está). */
  telefonoCliente(cuit: string | null, razonSocial: string): Promise<string | null>
  /** Eventos recientes (para "Novedades"). */
  eventosRecientes(desde: string): Promise<Evento[]>

  /** Avisa cuando cambia algo en pedidos o eventos (tiempo real). Devuelve la función para dejar de escuchar. */
  escuchar(cb: () => void): () => void
}

export class ApiError extends Error {}

/** Hay sesión iniciada pero esa cuenta no tiene rol en Entregas. */
export class SinAcceso extends Error {
  email: string
  constructor(email: string) {
    super('Sin acceso a Entregas')
    this.email = email
  }
}

/** Mensaje entendible a partir de un error de Supabase/Postgres. */
export function mensajeError(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: string } | null
  const msg = e?.message ?? String(error)
  if (e?.code === '23505' || /duplicate key|entregas_pedidos_remito_vivo/i.test(msg)) return 'Ese número de remito ya está cargado y en curso.'
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) return msg.startsWith('No podés') ? msg : 'No tenés permiso para hacer esto.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión. Revisá internet y probá de nuevo.'
  return msg
}
