// Coaching por vendedor (3/11, Felipe: «cómo hacer que el CRM conozca las maneras de cada comercial y lo ayude donde encuentre falencias»).
// Capa 1, sin IA y sin costo: con los contactos que cada persona anota en la Cola del día (team_shared_notes, kind «contacto»)
// se ve cuánto contacta, cuánto responde, por qué le dicen que no y dónde conviene practicar en Academia.
// Son señales para conversar, no un puntaje de la persona: con pocos datos no se sugiere nada.
import { REJECTION_REASONS } from './prospect-model.mjs';

const DAY = 86400000;
const INTEREST = /con inter[eé]s|pidi[oó] cotizaci|respondi[oó], sigue/i;
const MIN_FOR_ADVICE = 8;

// Qué practicar según el motivo de rechazo (las claves son las de OBJECTIONS en Academia comercial).
export const PRACTICE_FOR = {
  Precio: { objection: 'precio', text: 'Practicar «Es caro / precio»: preguntar con qué lo compara y construir valor antes de hablar de descuento.' },
  'No llega al mínimo de USD 1.800': { objection: 'precio', text: 'Practicar cómo presentar el mínimo de compra y el valor total (respaldo técnico, rendimiento).' },
  'Ya tiene proveedor': { objection: 'proveedor', text: 'Practicar «Ya tengo proveedor»: qué valora de él y proponer una prueba puntual y complementaria.' },
  Dólar: { objection: 'momento', text: 'Practicar «No es el momento»: ofrecer cotización con vigencia corta sin inventar urgencia.' },
  'No vende ni usa espuma': { objection: '', text: 'Revisar la selección: muchos «no vende ni usa» sugieren que se está llegando a rubros que no encajan (mirar el sitio antes de escribir).' },
  'Es revendedor (no es perfil)': { objection: '', text: 'Revisar la selección: muchos revendedores sugieren filtrar mejor antes de contactar (mirar si fabrican o aplican).' },
};

const parts = (outcome) => String(outcome || '').split('·').map((part) => part.trim()).filter(Boolean);

export function coachingByPerson(rows = [], { now = Date.now(), days = 90 } = {}) {
  const since = now - days * DAY;
  const people = new Map();
  for (const row of rows) {
    if (!row || row.kind !== 'contacto') continue;
    const at = Date.parse(row.noted_at || '');
    if (Number.isFinite(at) && at < since) continue;
    const key = String(row.author_email || '').toLowerCase();
    if (!key) continue;
    if (!people.has(key)) people.set(key, { email: key, name: row.author_name || key.split('@')[0], contacts: 0, interested: 0, noReply: 0, last7: 0, reasons: new Map(), families: new Map() });
    const person = people.get(key);
    const outcome = parts(row.outcome);
    const yes = outcome.some((entry) => INTEREST.test(entry));
    person.contacts += 1;
    if (yes) person.interested += 1;
    if (Number.isFinite(at) && at >= now - 7 * DAY) person.last7 += 1;
    const reason = outcome.find((entry) => REJECTION_REASONS.includes(entry));
    if (reason === 'No respondió') person.noReply += 1;
    else if (reason) person.reasons.set(reason, (person.reasons.get(reason) || 0) + 1);
    const family = /\(([^,)]+)/.exec(String(row.note || ''))?.[1];
    if (family && !/^zona|^versi/i.test(family)) {
      const entry = person.families.get(family) || { family, contacted: 0, interested: 0 };
      entry.contacted += 1;
      if (yes) entry.interested += 1;
      person.families.set(family, entry);
    }
  }
  return [...people.values()].map((person) => {
    const reasons = [...person.reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
    const rejected = reasons.reduce((sum, item) => sum + item.count, 0);
    const advice = [];
    if (person.contacts >= MIN_FOR_ADVICE) {
      const top = reasons[0];
      if (top && top.count >= 3 && top.count / Math.max(rejected, 1) >= 0.4 && PRACTICE_FOR[top.reason]) advice.push({ ...PRACTICE_FOR[top.reason], because: `«${top.reason}» es el ${Math.round((top.count / rejected) * 100)} % de sus rechazos (${top.count} de ${rejected}).` });
      if (person.noReply / person.contacts >= 0.5) advice.push({ objection: '', text: 'Más de la mitad no responde: probar otra versión del primer mensaje, otro horario y un recordatorio a los 2 días.', because: `${person.noReply} de ${person.contacts} no respondieron.` });
      const weak = [...person.families.values()].filter((entry) => entry.contacted >= 5 && entry.interested === 0).sort((a, b) => b.contacted - a.contacted)[0];
      if (weak) advice.push({ objection: '', text: `En ${weak.family} no tuvo respuestas con interés: revisar el mensaje y a quién se le escribe en esa familia.`, because: `${weak.contacted} contactos en ${weak.family}, ninguno con interés.` });
    }
    return {
      email: person.email, name: person.name, contacts: person.contacts, interested: person.interested,
      rate: person.contacts ? Math.round((person.interested / person.contacts) * 100) : 0,
      noReply: person.noReply, last7: person.last7, reasons: reasons.slice(0, 4),
      families: [...person.families.values()].sort((a, b) => b.contacted - a.contacted).slice(0, 4),
      advice, enoughData: person.contacts >= MIN_FOR_ADVICE,
    };
  }).sort((a, b) => b.contacts - a.contacts);
}
