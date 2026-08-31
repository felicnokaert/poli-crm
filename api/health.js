async function checkDatabase(environment = process.env, request = fetch) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const result = await request(`${url}/rest/v1/whatsapp_events?select=event_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return result.ok;
  } catch {
    return false;
  }
}

export default async function handler(_request, response) {
  const databaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return response.status(200).json({
    ok: true,
    database: databaseConfigured,
    databaseReachable: await checkDatabase(),
    metaWebhook: Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET),
    generalChannel: Boolean(process.env.WHATSAPP_GENERAL_PHONE_ID),
    penosilChannel: Boolean(process.env.WHATSAPP_PENOSIL_PHONE_ID),
    browserBridge: Boolean(process.env.WHATSAPP_BRIDGE_TOKEN),
    simulator: Boolean(process.env.COPILOT_SIMULATOR_TOKEN),
  });
}
