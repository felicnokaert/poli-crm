import { crearDemoApi } from '../dev/demoApi'
import type { Api } from './api'
import { crearSupabaseApi } from './supabaseApi'

/** `npm run maqueta`: datos de ejemplo en el navegador, sin login real ni base. */
export const MAQUETA = import.meta.env.MODE === 'maqueta'

export const api: Api = MAQUETA ? crearDemoApi() : crearSupabaseApi()
