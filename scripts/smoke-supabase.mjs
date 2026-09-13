// Chequeo manual de conectividad contra Supabase real.
//
// NO forma parte de la suite de tests (`pnpm test`) ni corre en CI/CD -
// es intencional: pegarle a Supabase real desde la suite automática mezclaría
// unit tests con dependencias externas (rechazado en una ronda de auditoría
// anterior). Este script es para que quien despliega lo corra a mano después
// de un deploy o de tocar variables de entorno, como chequeo rápido de "¿la
// app puede hablar con la base?" sin tener que loguearse en el CRM y navegar
// hasta /api/readiness (que además requiere sesión corporativa).
//
// Uso:
//   node scripts/smoke-supabase.mjs
//
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno (las mismas
// que usa Vercel). Si no están, el script lo explica y termina con éxito
// (exit 0) en vez de fallar - no hay nada roto, simplemente no hay contra qué
// probar en esta máquina.

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('SMOKE_SKIP: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno. Nada para chequear.');
  process.exit(0);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const started = Date.now();

try {
  const response = await fetch(
    `${url}/rest/v1/workspace_states?select=workspace_key,updated_at&limit=1`,
    { headers },
  );
  const elapsedMs = Date.now() - started;

  if (!response.ok) {
    console.error(`SMOKE_FAIL: workspace_states respondió ${response.status} ${response.statusText} (${elapsedMs}ms)`);
    process.exit(1);
  }

  const rows = await response.json();
  console.log(`SMOKE_OK: Supabase respondió en ${elapsedMs}ms. Filas en workspace_states: ${rows.length}.`);
  if (rows[0]) {
    console.log(`  último workspace_key visto: "${rows[0].workspace_key}", updated_at: ${rows[0].updated_at}`);
  }
  process.exit(0);
} catch (error) {
  console.error('SMOKE_FAIL: no se pudo contactar a Supabase:', error.message);
  process.exit(1);
}
