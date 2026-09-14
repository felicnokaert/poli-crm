import { withRetry } from './retry.mjs';

// Tablas propias de este CRM (ver docs/CRM_ARCHITECTURE.md) - excluye a
// propósito las del cotizador/inventario que comparten este mismo proyecto
// de Supabase (catalog_*, sales_quotes, commercial_rules, etc.): esas son
// responsabilidad de esa otra app, no de este backup.
const BACKUP_TABLES = [
  'whatsapp_events',
  'technical_documents',
  'technical_document_history',
  'copilot_states',
];

// Cuántos días de backups diarios se conservan antes de borrarse - el plan
// gratuito de Supabase Storage tiene 1GB; con whatsapp_events como tabla más
// grande (miles de filas, pero texto corto) un backup diario pesa unos pocos
// MB, así que 14 días deja margen amplio sin acercarse al límite.
const RETENTION_DAYS = 14;

async function fetchTableRows(environment, table, fetchImpl) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` },
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, rows: await response.json() };
  });
  if (!result.ok) throw new Error(`No se pudo leer "${table}" para el backup (status ${result.status ?? 'sin respuesta'}).`);
  return result.rows;
}

// `upsert` (vía el header x-upsert) para que una segunda corrida del cron el
// mismo día (ej. un reintento manual) sobreescriba el archivo de ese día en
// vez de fallar por "ya existe".
async function uploadBackupFile(environment, path, rows, fetchImpl) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/storage/v1/object/backups/${path}`, {
        method: 'POST',
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'x-upsert': 'true',
        },
        body: JSON.stringify(rows),
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    return { ok: response.ok, status: response.status };
  });
  if (!result.ok) throw new Error(`No se pudo subir el backup "${path}" (status ${result.status ?? 'sin respuesta'}).`);
}

// Supabase Storage no tiene carpetas de verdad - listar con prefix: '' y
// limit alto devuelve las "carpetas" de fecha como entradas de primer nivel
// (una por cada día que ya se subió un backup).
async function listBackupDates(environment, fetchImpl) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/storage/v1/object/list/backups`, {
        method: 'POST',
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: '', limit: 1000 }),
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, entries: await response.json() };
  });
  if (!result.ok) throw new Error(`No se pudieron listar los backups existentes (status ${result.status ?? 'sin respuesta'}).`);
  return (result.entries || [])
    .map((entry) => entry.name)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
}

async function removeBackupFolder(environment, date, fetchImpl) {
  const allTables = ['workspace_states', ...BACKUP_TABLES];
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/storage/v1/object/remove`, {
        method: 'DELETE',
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: allTables.map((table) => `${date}/${table}.json`) }),
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    return { ok: response.ok, status: response.status };
  });
  if (!result.ok) throw new Error(`No se pudo borrar el backup "${date}" (status ${result.status ?? 'sin respuesta'}).`);
}

// Borra las carpetas de fecha más viejas que RETENTION_DAYS. Separado de
// runDailyBackup (no lo llama internamente) para que un fallo acá no impida
// que el backup del día ya se haya subido - cron-daily-maintenance.js decide
// el orden y qué hacer si esto falla.
export async function cleanupOldBackups(environment, nowISO, fetchImpl = fetch) {
  const cutoff = new Date(nowISO);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const dates = await listBackupDates(environment, fetchImpl);
  const toDelete = dates.filter((date) => date < cutoffDate);
  for (const date of toDelete) {
    await removeBackupFolder(environment, date, fetchImpl);
  }
  return toDelete;
}

// Sube un snapshot JSON de hoy de cada tabla propia del CRM a
// backups/<YYYY-MM-DD>/<tabla>.json. `workspaceStatesRows` se recibe ya
// leído (cron-daily-maintenance.js lo pide de todos modos para el
// mantenimiento diario) para no duplicar esa lectura.
export async function runDailyBackup(environment, workspaceStatesRows, nowISO, fetchImpl = fetch) {
  const today = nowISO.slice(0, 10);
  const filesUploaded = [];

  await uploadBackupFile(environment, `${today}/workspace_states.json`, workspaceStatesRows, fetchImpl);
  filesUploaded.push('workspace_states');

  for (const table of BACKUP_TABLES) {
    const rows = await fetchTableRows(environment, table, fetchImpl);
    await uploadBackupFile(environment, `${today}/${table}.json`, rows, fetchImpl);
    filesUploaded.push(table);
  }

  return { filesUploaded };
}
