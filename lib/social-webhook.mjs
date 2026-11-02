// Instagram y Facebook en el receptor de webhooks (2/11, etapa 1 del plan docs/PLAN_INSTAGRAM_FACEBOOK_2026-10-31.md): solo LECTURA.
// Mensajes directos (Instagram y Messenger) y comentarios (Instagram y Facebook) se guardan en whatsapp_events con el mismo formato que
// WhatsApp, así aparecen en Por revisar con su pestaña por línea. El id de la página o de la cuenta de Instagram se mapea a una línea con
// whatsapp_channels (phone_number_id = ese id), igual que los números de WhatsApp: sin fila, el evento queda en 'unknown'.
// APAGADO hasta cargar META_SOCIAL_ENABLED=true en Vercel; antes de eso se confirma el webhook (200) y no se guarda nada.

export const SOCIAL_OBJECTS = ['instagram', 'page'];
export const socialEnabled = (env = process.env) => String(env.META_SOCIAL_ENABLED || '').toLowerCase() === 'true';

const iso = (value) => {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return new Date(number > 1e12 ? number : number * 1000).toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
};

const KIND = { instagram: 'ig', page: 'fb' };

// accountMap: id de página o de cuenta de Instagram → clave de la línea (ver buildPhoneMap).
export function normalizeSocialWebhook(payload, accountMap = {}) {
  const platform = KIND[payload?.object];
  if (!platform) return [];
  const events = [];
  for (const entry of payload?.entry || []) {
    const accountId = String(entry?.id || '');
    const channel = accountMap[accountId] || 'unknown';
    const base = { phone_number_id: accountId, display_phone_number: '', channel, direction: 'inbound', classification_status: 'pending' };

    // Mensajes directos: lo que escribe un cliente. Los «ecos» (lo que mandamos nosotros) y los avisos de lectura no se guardan.
    for (const item of entry?.messaging || []) {
      const message = item?.message;
      const senderId = String(item?.sender?.id || '');
      if (!message?.mid || !senderId || message.is_echo || senderId === accountId) continue;
      const attachments = Array.isArray(message.attachments) ? message.attachments.map((a) => a?.type).filter(Boolean) : [];
      events.push({
        ...base,
        event_id: `${platform}:${message.mid}`,
        customer_wa_id: `${platform}:${senderId}`,
        customer_name: '',
        message_type: platform === 'ig' ? 'instagram_dm' : 'messenger',
        text_body: message.text || (attachments.length ? `[${attachments.join(', ')}]` : ''),
        occurred_at: iso(item.timestamp),
        raw_payload: item,
      });
    }

    // Comentarios en publicaciones. Los de la propia cuenta (respuestas nuestras) no cuentan.
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (platform === 'ig' && change?.field === 'comments' && value.id) {
        const fromId = String(value.from?.id || '');
        if (!fromId || fromId === accountId) continue;
        events.push({
          ...base,
          event_id: `ig:comment:${value.id}`,
          customer_wa_id: `ig:${fromId}`,
          customer_name: value.from?.username || '',
          message_type: 'instagram_comment',
          text_body: value.text || '',
          occurred_at: iso(value.created_time || entry.time),
          raw_payload: value,
        });
      } else if (platform === 'fb' && change?.field === 'feed' && value.item === 'comment' && value.verb === 'add' && value.comment_id) {
        const fromId = String(value.from?.id || '');
        if (!fromId || fromId === accountId) continue;
        events.push({
          ...base,
          event_id: `fb:comment:${value.comment_id}`,
          customer_wa_id: `fb:${fromId}`,
          customer_name: value.from?.name || '',
          message_type: 'facebook_comment',
          text_body: value.message || '',
          occurred_at: iso(value.created_time || entry.time),
          raw_payload: value,
        });
      }
    }
  }
  return events;
}
