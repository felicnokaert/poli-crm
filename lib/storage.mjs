export async function persistEvents(events, environment = process.env) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !events.length) return { stored: 0, configured: false };
  const response = await fetch(`${url}/rest/v1/whatsapp_events?on_conflict=event_id&select=event_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(events),
  });
  if (!response.ok) throw new Error(`Storage failed: ${response.status}`);
  // Con ignore-duplicates la base devuelve SOLO las filas realmente nuevas: así la respuesta automática no contesta dos veces un reintento de Meta (4/11).
  const rows = await response.json().catch(() => null);
  const inserted = Array.isArray(rows) ? rows.map((row) => String(row.event_id)) : null;
  return { stored: events.length, configured: true, inserted };
}

