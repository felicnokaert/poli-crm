// Reintentos simples con backoff exponencial acotado, para operaciones de
// guardado contra Supabase que pueden fallar por un problema transitorio de
// red o un 5xx pasajero. A propósito NO reintenta errores de autenticación
// ni de validación (4xx que no sea 408/429): esos van a fallar de nuevo
// exactamente igual, y reintentarlos solo agrega latencia.
export const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableHttpStatus(status) {
  return RETRYABLE_HTTP_STATUS.has(Number(status));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `attempt(attemptIndex)` debe devolver { ok: true, ... } o { ok: false, status, error }.
// Reintenta mientras `ok` sea false y el resultado sea "reintentable" (según
// `isRetryable`, que por defecto usa el status HTTP), hasta `retries` veces
// extra (o sea, `retries + 1` intentos totales), con backoff exponencial
// (`baseDelayMs * 2^intentosPrevios`).
export async function withRetry(attempt, { retries = 2, baseDelayMs = 300, isRetryable = (result) => isRetryableHttpStatus(result?.status) } = {}) {
  let lastResult;
  for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex += 1) {
    let result;
    try {
      result = await attempt(attemptIndex);
    } catch (error) {
      // Un throw (por ejemplo, fetch rechazado por un corte de red) también
      // cuenta como un intento fallido reintentable: no hay status HTTP
      // porque la request nunca llegó a completarse.
      result = { ok: false, status: undefined, error, threw: true };
    }
    if (result?.ok) return result;
    lastResult = result;
    const canRetry = attemptIndex < retries && (result?.threw || isRetryable(result));
    if (!canRetry) break;
    await delay(baseDelayMs * 2 ** attemptIndex);
  }
  if (lastResult?.threw) throw lastResult.error;
  return lastResult;
}
