// Logging estructurado mínimo, sin librerías: los logs de Vercel muestran
// cada línea de stdout/stderr tal cual, así que loguear un solo objeto JSON
// por línea (en vez de texto libre) los hace buscables/filtrables por campo
// (endpoint, workspaceKey, etc.) en el buscador de logs de Vercel o en
// cualquier herramienta que después los ingiera.
//
// A propósito no agrega niveles, transports, ni nada más: es un
// "console.error con forma", no un logger de verdad. Si en algún momento
// hay una plataforma de logs (Datadog/Better Stack/etc.) consumiendo esto,
// ahí sí conviene evaluar una librería real.
export function logError(endpoint, message, context = {}, error) {
  console.error(
    JSON.stringify({
      level: 'error',
      endpoint,
      message,
      ...context,
      error: error ? (error.stack || error.message || String(error)) : undefined,
      timestamp: new Date().toISOString(),
    })
  );
}
