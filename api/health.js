export default function handler(_request, response) {
  return response.status(200).json({
    ok: true,
    database: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    metaWebhook: Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET),
    generalChannel: Boolean(process.env.WHATSAPP_GENERAL_PHONE_ID),
    penosilChannel: Boolean(process.env.WHATSAPP_PENOSIL_PHONE_ID),
    simulator: Boolean(process.env.COPILOT_SIMULATOR_TOKEN),
  });
}

