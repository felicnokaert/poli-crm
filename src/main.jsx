import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// El service worker se dio de baja (04/09/2026): cacheaba la app y a veces
// servía una versión vieja incluso después de un deploy nuevo. Si alguien
// ya lo tiene instalado en su navegador, public/sw.js se encarga de
// limpiarse y desregistrarse solo la próxima vez que abra la app.
