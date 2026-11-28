export type Estado = 'cargado' | 'impreso' | 'bloqueado' | 'despachado' | 'entregado' | 'incidencia' | 'cancelado'
export type Rol = 'vendedor' | 'expedicion' | 'admin'
export type MotivoBloqueo = 'sin_stock' | 'falta_pago' | 'datos_incompletos' | 'otro'
export type MotivoIncidencia = 'demora' | 'rechazado' | 'devuelto' | 'danado' | 'direccion' | 'otro'
export type TipoArchivo = 'remito' | 'guia' | 'remito_firmado' | 'foto' | 'otro'
export type Pelota = 'vendedor' | 'expedicion' | 'expreso' | null

export interface Usuario {
  id: string
  email: string
  nombre: string
  rol: Rol
  /** Cuenta compartida (expedición): varias personas, cada una elige su nombre en el dispositivo. */
  compartida?: boolean
  /** Persona que está usando la cuenta compartida en este dispositivo. */
  operador?: string | null
}

export interface Expreso {
  id: string
  nombre: string
  tracking_url: string | null
  dias_esperados: number
  requiere_guia: boolean
  activo: boolean
  orden: number
}

export interface Config {
  horas_sin_imprimir: number
  dias_sin_despachar: number
  dias_bloqueado: number
  /** Personas que usan la cuenta compartida de expedición. */
  operadores: string[]
  /** Depósitos desde donde sale la mercadería (cada dispositivo elige el suyo). */
  depositos: string[]
}

export const CONFIG_DEFAULT: Config = {
  horas_sin_imprimir: 4, dias_sin_despachar: 2, dias_bloqueado: 3,
  operadores: ['Marcos', 'Neyen', 'Jeremías', 'Facundo', 'Juan', 'Braian'],
  depositos: ['Villa Domínico', 'Mar del Plata'],
}

export interface ItemRemito {
  cantidad: number
  codigo: string
  descripcion: string
}

export interface Pedido {
  id: string
  codigo: number
  n_remito: string
  fecha_remito: string | null
  cliente: string
  cuit: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cp: string | null
  telefono: string | null
  contacto: string | null
  nota: string | null
  expreso_id: string | null
  vendedor_id: string
  vendedor_email: string | null
  estado: Estado
  estado_desde: string
  impreso_at: string | null
  bloqueo_motivo: MotivoBloqueo | null
  bloqueo_detalle: string | null
  stock_estimado: string | null
  fecha_despacho: string | null
  n_guia: string | null
  bultos: number | null
  fecha_entrega: string | null
  incidencia_motivo: MotivoIncidencia | null
  incidencia_detalle: string | null
  items: ItemRemito[]
  remito_hash: string | null
  created_at: string
  updated_at: string
  /** Quién lo cargó, si fue desde la cuenta compartida de expedición. */
  operador?: string | null
  /** Desde qué depósito sale (Villa Domínico, Mar del Plata u otro escrito a mano). */
  deposito_salida?: string | null
  // Calculados por la vista
  tiene_guia_archivo: boolean
  tiene_comprobante: boolean
  archivos: number
  ultima_actividad: string | null
  /** Quién lo despachó y desde qué depósito (último paso a despachado). */
  despacho_operador?: string | null
  despacho_deposito?: string | null
  despacho_user_id?: string | null
  despacho_email?: string | null
  /** Cuándo salió (último paso a despachado). */
  despacho_at?: string | null
}

/** Pedido de la tienda online (Shopify) que todavía hay que facturar, remitir y preparar (28/11). */
export interface PedidoShopify {
  id: string
  name: string
  created_at: string
  total: number | null
  currency: string
  delivery: '' | 'SHIPPING' | 'PICK_UP'
  shipping_title: string
  items: { sku: string; title: string; qty: number; price: number | null }[]
  cliente: { nombre?: string; empresa?: string; telefono?: string; email?: string; direccion?: string; localidad?: string; provincia?: string; cp?: string }
  cancelado: boolean
  factura_at: string | null
  remito_at: string | null
  produccion_at: string | null
  pasos_por: string | null
}
export type PasoShopify = 'factura' | 'remito' | 'produccion'

export interface Evento {
  id: number
  pedido_id: string
  user_id: string | null
  user_email: string | null
  tipo: 'alta' | 'estado' | 'archivo' | 'comentario' | 'edicion'
  de_estado: Estado | null
  a_estado: Estado | null
  nota: string | null
  datos: Record<string, unknown> | null
  /** Persona de expedición que lo hizo (cuenta compartida). */
  operador?: string | null
  /** Depósito desde donde se hizo. */
  deposito?: string | null
  created_at: string
}

export interface Archivo {
  id: string
  pedido_id: string
  tipo: TipoArchivo
  nombre: string
  storage_path: string
  mime: string | null
  tamano: number | null
  subido_por: string | null
  subido_email: string | null
  operador?: string | null
  deposito?: string | null
  created_at: string
}

export interface RolAsignado {
  email: string
  rol: Rol
  nombre: string | null
  compartida: boolean
}

export interface NuevoPedido {
  n_remito: string
  fecha_remito: string | null
  cliente: string
  cuit: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cp: string | null
  telefono: string | null
  contacto: string | null
  nota: string | null
  expreso_id: string | null
  deposito_salida?: string | null
  items: ItemRemito[]
  remito_hash: string | null
}

/** Datos extra que acompañan un cambio de estado (cada estado usa los suyos). */
export interface DatosCambio {
  bloqueo_motivo?: MotivoBloqueo
  bloqueo_detalle?: string | null
  stock_estimado?: string | null
  fecha_despacho?: string
  n_guia?: string | null
  bultos?: number | null
  expreso_id?: string | null
  fecha_entrega?: string
  incidencia_motivo?: MotivoIncidencia
  incidencia_detalle?: string | null
}

export type CamposEditables = Partial<Pick<Pedido,
  'n_remito' | 'fecha_remito' | 'cliente' | 'cuit' | 'direccion' | 'localidad' | 'provincia' | 'cp' | 'telefono' |
  'contacto' | 'nota' | 'expreso_id' | 'n_guia' | 'bultos' | 'fecha_despacho' | 'fecha_entrega' | 'stock_estimado' | 'deposito_salida'>>
