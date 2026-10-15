import { applyEnrichment } from './prospect-enrich-apply.mjs';

// Guarda en el prospecto lo que concluyó la investigación en la app (puntaje,
// razonamiento y citas) y completa solo campos vacíos con los contactos del sitio.
export function applyResearch(prospect, result, now = new Date().toISOString()) {
  if (!result?.ok) return { prospect, added: [] };
  const base = { ...prospect };
  if (!base.website && result.website) base.website = result.website;
  const enriched = result.contacts
    ? applyEnrichment(base, { ok: true, facebook: result.contacts.facebook, instagram: result.contacts.instagram, emails: result.contacts.emails, whatsapp: result.contacts.whatsapp }, now)
    : { prospect: base, added: [] };
  const research = { score: result.score ?? 0, label: result.label || '', reasoning: result.reasoning || [], evidence: result.evidence || [], competitors: result.competitors || [], pages: result.pages || [], at: now };
  return { prospect: { ...enriched.prospect, research, updatedAt: now }, added: enriched.added };
}

// Nombre de empresa a partir del título de un resultado de búsqueda
// ("Poliurex - Aplicación de poliuretano | Rosario" -> "Poliurex").
export function companyFromTitle(title = '', host = '') {
  const first = String(title).split(/\s[-–|·:]\s|\s\|\s/)[0].trim();
  if (first && first.length >= 3 && first.length <= 60) return first;
  return String(host).replace(/^www\./, '').split('.')[0];
}
