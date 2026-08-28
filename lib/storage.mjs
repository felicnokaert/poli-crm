export async function persistEvents(events, environment = process.env) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !events.length) return { stored: 0, configured: false };
  const response = await fetch(`${url}/rest/v1/whatsapp_events?on_conflict=event_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(events),
  });
  if (!response.ok) throw new Error(`Storage failed: ${response.status}`);
  return { stored: events.length, configured: true };
}

