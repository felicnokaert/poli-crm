import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './components/pantalla.css'
import App from './App.tsx'
import { MODO_CONTEO } from './lib/cliente'
import { seguirTemaDelCrm } from './lib/tema'

seguirTemaDelCrm()
// Versión de la app de conteo (`vite build --mode conteo`): sus estilos propios (tablero del depósito, P de carga, firma).
if (MODO_CONTEO) void import('./conteo.css')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
