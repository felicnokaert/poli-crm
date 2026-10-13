// Logica pura del panel "Canales de WhatsApp" (src/ChannelsAdmin.jsx): armar la
// clave del canal, leer la lista de correos y validar el borrador antes de
// escribir en la tabla whatsapp_channels. La seguridad real la pone la base
// (RLS + checks); esto evita mandar datos que la base va a rechazar y explica
// el error en castellano.
export const BASE_CHANNEL_KEYS = ['general', 'penosil', 'juan'];
const CORPORATE_DOMAIN = '@grupopoliplast.com.ar';
const BACKUP_EMAIL = 'felipecnokaert@gmail.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function slugifyChannelKey(label, existingKeys = []) {
  const base = String(label || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^whatsapp\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'canal';
  const taken = new Set(existingKeys);
  let key = base.length >= 2 ? base : `${base}-1`;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`.slice(0, 30);
  return key;
}

export function parseMemberEmails(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function validateChannelDraft(draft, { existing = [], editingKey = null } = {}) {
  const errors = [];
  const label = String(draft.label || '').trim();
  if (!label) errors.push('Poné un nombre para el canal (por ejemplo "WhatsApp RAPYP").');
  const phoneId = String(draft.phoneNumberId || '').trim();
  if (phoneId && !/^\d{8,20}$/.test(phoneId)) errors.push('El ID del número de Meta son solo dígitos (entre 8 y 20).');
  if (phoneId && existing.some((row) => row.channel_key !== editingKey && row.phone_number_id === phoneId)) {
    errors.push('Ese ID de número ya está asignado a otro canal.');
  }
  const color = String(draft.color || '').trim();
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) errors.push('El color tiene que ser tipo #0d7764.');
  const members = parseMemberEmails(draft.membersText);
  const invalid = members.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalid.length) errors.push(`Correo inválido: ${invalid.join(', ')}.`);
  const outside = members.filter((email) => EMAIL_PATTERN.test(email) && !email.endsWith(CORPORATE_DOMAIN) && email !== BACKUP_EMAIL);
  if (outside.length) errors.push(`Solo cuentas ${CORPORATE_DOMAIN} pueden usar el CRM: ${outside.join(', ')}.`);
  return { errors, members, phoneId, label, color };
}

// Los canales historicos no se borran desde la pantalla: sus mensajes y la
// bandeja de Felipe/Juan/info dependen de ellos.
export function canDeleteChannel(key) {
  return !BASE_CHANNEL_KEYS.includes(key);
}
