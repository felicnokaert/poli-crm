import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { diagnoseMeta } from '../lib/meta-diagnose.mjs';

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

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.META_SYSTEM_USER_TOKEN) return response.status(503).json({ error: 'Falta el acceso técnico de Meta.' });

  if (request.body?.action === 'diagnose') {
    const report = await diagnoseMeta({ token: process.env.META_SYSTEM_USER_TOKEN, wabas: { ...WABAS, ...DIAGNOSE_ONLY } });
    return response.status(200).json({ ok: true, ...report });
  }

  const channel = request.body?.channel;
  const wabaId = WABAS[channel];
  if (!wabaId) return response.status(400).json({ error: 'Canal no válido.' });

  const result = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.META_SYSTEM_USER_TOKEN}` },
  });
  const body = await result.json();
  if (!result.ok || !body.success) return response.status(502).json({ error: 'Meta no pudo suscribir la cuenta.', details: body.error?.message || null });
  return response.status(200).json({ ok: true, channel, connectedBy: user.email });
}
