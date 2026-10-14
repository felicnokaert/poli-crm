// Aplica lo encontrado en el sitio web a un prospecto: solo completa campos
// vacíos (nunca pisa lo que ya cargó una persona) y deja constancia.
export function applyEnrichment(prospect, result, now = new Date().toISOString()) {
  if (!result?.ok || result.blockedByRobots) return { prospect, added: [] };
  const next = { ...prospect };
  const added = [];
  const fill = (field, value, label) => { if (value && !String(next[field] || '').trim()) { next[field] = value; added.push(label); } };
  fill('facebook', result.facebook, 'Facebook');
  fill('instagram', result.instagram, 'Instagram');
  fill('email', result.emails?.[0], 'email');
  if (result.whatsapp?.number) {
    const note = result.whatsapp.link
      ? `WhatsApp del sitio (posible): ${result.whatsapp.link}`
      : `WhatsApp del sitio: +${result.whatsapp.number} (no es celular argentino +54 9, sin link)`;
    if (!String(next.notes || '').includes(note)) {
      next.notes = [next.notes, note].filter(Boolean).join('\n');
      added.push('WhatsApp (posible)');
    }
    if (!next.phone && result.whatsapp.link) { next.phone = `+${result.whatsapp.number}`; added.push('teléfono'); }
  }
  next.enrichedAt = now;
  next.updatedAt = now;
  return { prospect: next, added };
}
