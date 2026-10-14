import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { diagnoseMeta, repairWebhook, webhookStatus } from '../lib/meta-diagnose.mjs';

const WABAS = {
  general: '1620643669067135',
  penosil: '2497921480672168',
  // Número de Juan: vive en una cuenta de WhatsApp Business (WABA) propia,
  // distinta de la de General/Penosil.
  juan: '203972567633203',
};

// Cuentas que el diagnóstico solo MIRA (no se suscriben): sirven para saber
// cuáles de las líneas ya conectadas en Meta están en la Cloud API.
const DIAGNOSE_ONLY = {
  rapyp: '1112488017871332',
  'grupo-6260': '1905159260145771',
  imperpur: '437494654776681',
  'poliplast-6638': '2888979907647971',
  'poliplast-6838': '324359964100261',
  'poliplast-3649': '924212056839806',
  resinplast: '2513542480059337',
};

const WEBHOOK_URL = 'https://poli-crm.vercel.app/api/whatsapp-webhook';
// App "Agente Poliplast", la que recibe los webhooks de WhatsApp.
const WABA_APP_ID = '857121580457426';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.META_SYSTEM_USER_TOKEN) return response.status(503).json({ error: 'Falta el acceso técnico de Meta.' });

  if (request.body?.action === 'diagnose') {
    const report = await diagnoseMeta({ token: process.env.META_SYSTEM_USER_TOKEN, wabas: { ...WABAS, ...DIAGNOSE_ONLY } });
    const webhook = await webhookStatus({ appId: report.token?.appId, appSecret: process.env.META_APP_SECRET, expectedUrl: WEBHOOK_URL });
    return response.status(200).json({ ok: true, ...report, webhook });
  }

  // Deja el webhook de la app apuntando de nuevo al CRM (URL + campo `messages`).
  if (request.body?.action === 'repair-webhook') {
    const appId = process.env.META_APP_ID || WABA_APP_ID;
    const result = await repairWebhook({ appId, appSecret: process.env.META_APP_SECRET, callbackUrl: WEBHOOK_URL, verifyToken: process.env.WHATSAPP_VERIFY_TOKEN });
    if (!result.ok) return response.status(502).json({ error: `Meta no aceptó el cambio: ${result.error}` });
    // Además se corta y se vuelve a crear la suscripción de la cuenta de General: una suscripción
    // "pegada" deja de entregar mensajes aunque el diagnóstico la muestre bien.
    const steps = [];
    const headers = { Authorization: `Bearer ${process.env.META_SYSTEM_USER_TOKEN}` };
    for (const method of ['DELETE', 'POST']) {
      try {
        const reply = await fetch(`https://graph.facebook.com/v23.0/${WABAS.general}/subscribed_apps`, { method, headers });
        const body = await reply.json().catch(() => ({}));
        steps.push({ method, ok: reply.ok && body.success !== false, error: body.error?.message || null });
      } catch (error) {
        steps.push({ method, ok: false, error: error?.message || 'sin respuesta de Meta' });
      }
    }
    return response.status(200).json({ ok: true, callbackUrl: WEBHOOK_URL, steps });
  }

  const channel = request.body?.channel;
  const wabaId = WABAS[channel];
  if (!wabaId) return response.status(400).json({ error: 'Este número todavía no tiene una cuenta de WhatsApp de Meta vinculada, así que no hay nada para sincronizar. Se vincula al conectar el número con Meta.' });

  const result = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.META_SYSTEM_USER_TOKEN}` },
  });
  const body = await result.json();
  if (!result.ok || !body.success) return response.status(502).json({ error: 'Meta no pudo suscribir la cuenta.', details: body.error?.message || null });
  return response.status(200).json({ ok: true, channel, connectedBy: user.email });
}
