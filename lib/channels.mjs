// Canales de WhatsApp definidos en la tabla whatsapp_channels (ver
// supabase/migrations/20261013120000_whatsapp_channels_table.sql). El webhook
// los suma a los 3 canales historicos que siguen resolviendose por variables
// de entorno (WHATSAPP_*_PHONE_ID); ante cualquier falla de la tabla se usa
// solo el entorno, asi que un problema de lectura nunca frena la bandeja.
export function envPhoneMap(environment = process.env) {
  const entries = [
    [environment.WHATSAPP_GENERAL_PHONE_ID, 'general'],
    [environment.WHATSAPP_PENOSIL_PHONE_ID, 'penosil'],
    [environment.WHATSAPP_JUAN_PHONE_ID, 'juan'],
    // Número de prueba de la app «Poliplast CRM Prueba» (27/10): entra a la bandeja del canal general.
    [environment.WHATSAPP_TEST_PHONE_ID, 'general'],
  ];
  return Object.fromEntries(entries.filter(([id]) => id));
}

export function tablePhoneMap(rows = []) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.phone_number_id && row?.channel_key) map[String(row.phone_number_id)] = row.channel_key;
  }
  return map;
}

// El entorno gana si ambos definen el mismo phone_number_id.
export function buildPhoneMap(environment = process.env, rows = []) {
  return { ...tablePhoneMap(rows), ...envPhoneMap(environment) };
}

export async function fetchChannelRows(environment = process.env, http = fetch) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const response = await http(`${url}/rest/v1/whatsapp_channels?select=channel_key,phone_number_id&phone_number_id=not.is.null`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
