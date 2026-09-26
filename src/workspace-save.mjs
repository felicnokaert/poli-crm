// Guardado del workspace con control de concurrencia optimista.
//
// Problema que resuelve (25-26/09/2026): workspace_states guarda TODO el estado
// de un usuario en un solo jsonb, y cada navegador lo escribia entero con un
// upsert sin mirar si alguien mas lo habia tocado. La tabla no esta en Realtime,
// asi que una pestaña abierta nunca se enteraba de lo que escribia el servidor
// (tareas de tasks-intake, marcas del cron) y su siguiente autoguardado lo
// pisaba: se perdian tareas de automatizacion en silencio.
//
// Ahora cada guardado dice "esto es lo que yo vi" (la version = updated_at de
// la fila). Si mientras tanto alguien escribio, la base no aplica el cambio; se
// vuelve a leer lo de afuera, se une con lo local y se reintenta. Solo despues
// de agotar los reintentos se escribe igual (con lo ultimo unido) para que un
// guardado nunca quede trabado.
//
// Todo se inyecta (no toca red), para poder probarlo.
//   tryUpdate(data, version)  -> { ok: true, version } | { ok: false }
//   fetchRemote()             -> { data, version } | null
//   forceWrite(data)          -> { version }   (upsert incondicional)
//   merge(local, remote)      -> estado unido
export async function saveWithConcurrency({ data, version, tryUpdate, fetchRemote, forceWrite, merge, maxAttempts = 4 }) {
  let current = data;
  let currentVersion = version;
  let merged = false;
  if (!currentVersion) {
    const created = await forceWrite(current);
    return { data: current, version: created.version, merged };
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await tryUpdate(current, currentVersion);
    if (result.ok) return { data: current, version: result.version, merged };
    const remote = await fetchRemote();
    if (!remote) {
      const created = await forceWrite(current);
      return { data: current, version: created.version, merged };
    }
    current = merge(current, remote.data);
    currentVersion = remote.version;
    merged = true;
  }
  const forced = await forceWrite(current);
  return { data: current, version: forced.version, merged };
}
