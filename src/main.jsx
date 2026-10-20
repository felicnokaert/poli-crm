import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './ConfirmDialog';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import './styles.css';
import './theme-dark.css';
import { applyTheme, readTheme } from './theme.mjs';

applyTheme(readTheme());

// Si se publicó una versión nueva con la app abierta, las partes que se cargan después (Más, Academia,
// Mapa…) ya no existen con su nombre viejo: "Failed to fetch dynamically imported module". En vez de
// mostrar el error, se recarga una vez para tomar la versión nueva (19/10).
window.addEventListener('vite:preloadError', (event) => {
  const key = 'poliplast-reload-for-new-version';
  let last = 0;
  try { last = Number(sessionStorage.getItem(key) || 0); } catch { /* sin almacenamiento */ }
  if (Date.now() - last < 30000) return; // ya se recargó hace poco: no entrar en un bucle
  event.preventDefault();
  try { sessionStorage.setItem(key, String(Date.now())); } catch { /* sin almacenamiento */ }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary full>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// El service worker se dio de baja (04/09/2026): cacheaba la app y a veces
// servía una versión vieja incluso después de un deploy nuevo. Si alguien
// ya lo tiene instalado en su navegador, public/sw.js se encarga de
// limpiarse y desregistrarse solo la próxima vez que abra la app.
