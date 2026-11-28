// Entregas como pantalla NATIVA de Poliplast App (28/11, Felipe: «Poliplast App es la aplicación y ya; no una adentro de otra»).
// Sin iframe: este componente se dibuja dentro de la app, con su cliente de Supabase y su sesión. Los estilos de Entregas los
// carga la app encerrados debajo de `.ent-nativo` (src/scope-css.mjs), así no tocan al resto.
import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import App from './App'
import type { Api } from './lib/api'
import { usarApi, usarClienteDeLaApp } from './lib/cliente'

export { default as estilosEntregas } from './styles.css?raw'
export { default as estilosTablero } from './components/pantalla.css?raw'
export { crearDemoApi } from './dev/demoApi'

export function EntregasNativa({ cliente, soloLectura = false, apiPrueba }: { cliente: SupabaseClient | null; soloLectura?: boolean; apiPrueba?: Api }) {
  // Antes del primer dibujo: el resto de Entregas lee `api` al usarlo. `apiPrueba`: datos de ejemplo (revisión visual).
  useState(() => { if (apiPrueba) usarApi(apiPrueba); else if (cliente) usarClienteDeLaApp(cliente, { soloLectura }); return true })
  return <App nativo />
}
