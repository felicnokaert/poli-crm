import { authenticatedCorporateUser } from './corporate-auth.mjs';

// Lógica de /api/readiness, extraída a lib/ para que NO cuente como su
// propio archivo bajo api/ (ver la nota larga en api/health.js sobre el
// límite de 12 Serverless Functions del plan Hobby de Vercel). Sigue
// siendo exactamente el mismo handler de antes, solo que ahora vive acá y
// api/health.js lo invoca según la URL pedida.
export async function handleReadiness(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
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
