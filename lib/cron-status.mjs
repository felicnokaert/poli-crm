import { withRetry } from './retry.mjs';

export const DAILY_MAINTENANCE_KEY = 'daily-maintenance';

// Deja constancia, en una tabla que solo escribe el servidor, de que el
// mantenimiento diario corrio (ver supabase/migrations/20260925190000_add_
// crm_system_status.sql). Es un upsert por `key`: siempre hay una sola fila
// con la ultima corrida. El llamador debe tratar un fallo de esto como no
// fatal - no vale la pena tirar abajo el cron por no poder anotar que corrio.
export async function recordCronRun(environment, { ok, detail }, nowISO, fetchImpl = fetch) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/rest/v1/crm_system_status?on_conflict=key`, {
        method: 'POST',
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ key: DAILY_MAINTENANCE_KEY, last_run_at: nowISO, ok: Boolean(ok), detail: detail ?? null, updated_at: nowISO }),
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    return { ok: response.ok, status: response.status };
  });
  if (!result.ok) throw new Error(`No se pudo registrar la corrida del cron (status ${result.status ?? 'sin respuesta'}).`);
}
