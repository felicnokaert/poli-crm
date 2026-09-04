// Service worker viejo, dado de baja (04/09/2026): cacheaba la app y a
// veces servía una versión desactualizada incluso después de un deploy
// nuevo — provocó que cuentas nuevas vieran datos/comportamiento viejo que
// ya habíamos corregido en el código. Este archivo se instala una sola vez
// más para limpiar el caché de cualquiera que ya lo tenga instalado y
// desregistrarse solo; después de eso, nadie vuelve a cargar un service
// worker (main.jsx ya no lo registra).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.navigate(client.url))),
  );
});
