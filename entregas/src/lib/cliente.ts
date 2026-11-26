// Una sola Entregas para el CRM y la app de conteo (25/11, Felipe: «una sola Entregas, sincronizada, simple»).
// - CRM y link directo: Supabase con la sesión del usuario (supabaseApi).
// - App de conteo (`vite build --mode conteo --base=/entregas/`): expedición SIN login; habla con la función de servidor
//   «entregas-crm» de la app de conteo, que guarda la clave del CRM (expedicionApi). Nunca hay sesión de expedicion@ en el navegador.
// - `npm run maqueta`: datos de ejemplo en el navegador.
import { crearDemoApi } from '../dev/demoApi'
import type { Api } from './api'
import { soloLectura } from './soloLectura'
export { AVISO_SOLO_LECTURA, soloLectura } from './soloLectura'
import { enMarcoPoliplast } from './embed'
import { crearExpedicionApi } from './expedicionApi'
import { crearSupabaseApi } from './supabaseApi'

export const MAQUETA = import.meta.env.MODE === 'maqueta'
/** Compilada para la app de conteo. */
export const MODO_CONTEO = import.meta.env.MODE === 'conteo'

/**
 * Modo prueba de Poliplast App (26/11, Felipe: «datos reales, pero que lo que toque no cambie nada»): con marco=poliplast y
 * solo-lectura=1 se lee todo de verdad y cualquier escritura se frena con «Modo prueba: no se guarda».
 */
export const SOLO_LECTURA = (() => {
  try { return enMarcoPoliplast() && new URLSearchParams(window.location.search).get('solo-lectura') === '1' } catch { return false }
})()
const apiBase: Api = MAQUETA ? crearDemoApi() : MODO_CONTEO ? crearExpedicionApi() : crearSupabaseApi()
export const api: Api = SOLO_LECTURA ? soloLectura(apiBase) : apiBase

/** «Cargar remito»: en conteo no (los remitos los cargan los vendedores, Felipe 21/11). */
export const CON_ARCHIVOS = !MODO_CONTEO
/** Imprimir remitos (barra «Imprimir todos», «Esta compu imprime sola», botón Imprimir): solo expedición, en la app de conteo.
 *  25/11, Felipe: «al comercial no le sirve, ninguno de los comerciales imprime; Diego y los chicos son los que imprimen». */
export const CON_IMPRIMIR = MODO_CONTEO || MAQUETA
/** Subir por la API de expedición del CRM (guías, remitos y remitos firmados, con emparejado y «sin asignar»). Solo conteo. */
export const CON_SUBIR = MODO_CONTEO
/** Qué se puede adjuntar al cambiar de estado (null = todo). En conteo el CRM no recibe fotos sueltas ni «otro». */
export const TIPOS_SUBIDA: readonly string[] | null = MODO_CONTEO ? ['guia', 'remito', 'remito_firmado'] : null
/** En conteo el N° de guía se lee al subir y viaja con el archivo: no se pregunta después. */
export const GUIA_LEIDA_AL_SUBIR = MODO_CONTEO
/** Ver el remito y las guías ya cargadas. */
export const CON_VER_ARCHIVOS = true
