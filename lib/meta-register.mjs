// Devolver un número a la API de WhatsApp (Cloud API) desde el CRM, sin el Explorador de Meta.
// Tres pasos: pedir el código (SMS o llamada), verificarlo y registrar con un PIN de 6 dígitos.
// OJO: al registrarlo en la API, la aplicación de WhatsApp Business y WhatsApp Web dejan de andar con ese número.
// Nunca devuelve ni registra el token; solo el mensaje de Meta.
const GRAPH = 'https://graph.facebook.com/v23.0';

async function call(path, body, token, http) {
  try {
    const response = await http(`${GRAPH}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false || data.error) return { ok: false, error: data.error?.message || `Meta respondió ${response.status}.` };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error?.message || 'Sin respuesta de Meta.' };
  }
}

export function cleanCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

export function cleanPin(pin) {
  const digits = String(pin || '').trim();
  return /^\d{6}$/.test(digits) ? digits : '';
}

export async function requestPhoneCode({ phoneId, token, method = 'SMS', http = fetch }) {
  if (!phoneId || !token) return { ok: false, error: 'Falta el número o el acceso técnico de Meta.' };
  const codeMethod = method === 'VOICE' ? 'VOICE' : 'SMS';
  return call(`/${phoneId}/request_code`, { code_method: codeMethod, language: 'es' }, token, http);
}

export async function verifyPhoneCode({ phoneId, token, code, http = fetch }) {
  const clean = cleanCode(code);
  if (!clean) return { ok: false, error: 'El código tiene 6 números.' };
  return call(`/${phoneId}/verify_code`, { code: clean }, token, http);
}

export async function registerPhone({ phoneId, wabaId, token, pin, http = fetch }) {
  const cleanedPin = cleanPin(pin);
  if (!cleanedPin) return { ok: false, error: 'El PIN tiene que ser de 6 números.' };
  const registered = await call(`/${phoneId}/register`, { messaging_product: 'whatsapp', pin: cleanedPin }, token, http);
  if (!registered.ok) return registered;
  // Después de registrar, se asegura la suscripción de la app a la cuenta.
  const subscribed = wabaId ? await call(`/${wabaId}/subscribed_apps`, {}, token, http) : { ok: true };
  return { ok: true, subscribed: subscribed.ok, subscribeError: subscribed.ok ? null : subscribed.error };
}
