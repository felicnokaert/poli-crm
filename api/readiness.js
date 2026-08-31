const ALLOWED_BACKUP = 'felipecnokaert@gmail.com';

function allowedEmail(email = '') {
  const normalized = email.toLowerCase();
  return normalized.endsWith('@grupopoliplast.com.ar') || normalized === ALLOWED_BACKUP;
}

async function authenticatedUser(request, environment = process.env, http = fetch) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return null;
  const result = await http(`${environment.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: environment.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!result.ok) return null;
  const user = await result.json();
  return allowedEmail(user.email) ? user : null;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });

  const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const [workspaceResult, eventsResult] = await Promise.all([
    fetch(`${process.env.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.grupo-poliplast&select=data,updated_at&limit=1`, { headers }),
    fetch(`${process.env.SUPABASE_URL}/rest/v1/whatsapp_events?select=channel,direction,occurred_at,phone_number_id&direction=eq.inbound&order=occurred_at.desc&limit=500`, { headers }),
  ]);
  if (!workspaceResult.ok || !eventsResult.ok) return response.status(503).json({ error: 'No se pudo verificar el estado operativo.' });
  const [workspaceRows, events] = await Promise.all([workspaceResult.json(), eventsResult.json()]);
  const state = workspaceRows[0]?.data || {};
  const channels = {};
  for (const key of ['general', 'penosil']) {
    const expectedPhoneId = key === 'general'
      ? process.env.WHATSAPP_GENERAL_PHONE_ID
      : process.env.WHATSAPP_PENOSIL_PHONE_ID;
    // Simulator fixtures use synthetic phone IDs. They are useful for UI tests,
    // but must never make a real WhatsApp channel look operational.
    const channelEvents = events.filter((event) => event.channel === key && [expectedPhoneId, `browser-bridge:${key}`].includes(event.phone_number_id));
    const officialEvents = channelEvents.filter((event) => event.phone_number_id === expectedPhoneId);
    channels[key] = {
      configured: Boolean(expectedPhoneId),
      inboundEvents: channelEvents.length,
      lastInboundAt: channelEvents[0]?.occurred_at || null,
      source: officialEvents.length ? 'meta' : channelEvents.length ? 'browser-bridge' : null,
    };
  }
  return response.status(200).json({
    ok: true,
    workspace: {
      clients: state.clients?.length || 0,
      conversations: state.interactions?.length || 0,
      tasks: state.tasks?.length || 0,
      updatedAt: workspaceRows[0]?.updated_at || null,
    },
    channels,
  });
}
