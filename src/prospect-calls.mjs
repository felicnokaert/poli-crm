// Orden de llamada (12/11, Felipe: «armalo» en el CRM): los prospectos de PRIORIDAD de la pestaña Limpieza, con teléfono, ordenados por
// zona y, dentro de cada zona, por la ciudad con más prospectos, para llamar de corrido. Puro y testeado.
import { classifyProspect } from './prospect-cleanup.mjs';
import { checkEmail } from './prospect-contact.mjs';
import { arToday } from './ar-date.mjs';

export const ZONES = [
  { id: 'amba', name: 'CABA y Gran Buenos Aires' },
  { id: 'santafe', name: 'Santa Fe' },
  { id: 'entrerios', name: 'Entre Ríos' },
  { id: 'bsas', name: 'Buenos Aires: costa e interior' },
  { id: 'noroeste', name: 'Noroeste' },
  { id: 'patagonia', name: 'Patagonia' },
  { id: 'cuyo', name: 'Cuyo, Córdoba y Misiones' },
  { id: 'otras', name: 'Otras zonas' },
];

const plain = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const GBA = /\b(pilar|lanus|lomas de zamora|san fernando|virreyes|ituzaingo|moreno|paso del rey|la matanza|san justo|san martin|quilmes|tigre|escobar|moron|merlo|berazategui|florencio varela|almirante brown|esteban echeverria|ezeiza|san isidro|vicente lopez|hurlingham|tres de febrero|jose c paz|malvinas argentinas|san miguel|general rodriguez|villa dominico|wilde|banfield|temperley|adrogue|burzaco|ramos mejia|haedo|castelar|caseros|ciudadela|florida|olivos|martinez|don torcuato|garin|campana|zarate)\b/;

export function zoneOf(prospect = {}) {
  const province = plain(prospect.province);
  const city = plain(prospect.city);
  if (/^(caba|capital federal|ciudad autonoma)/.test(province) || /^caba\b/.test(city)) return 'amba';
  if (province === 'buenos aires') return GBA.test(city) ? 'amba' : 'bsas';
  if (province === 'santa fe') return 'santafe';
  if (province === 'entre rios') return 'entrerios';
  if (/^(salta|tucuman|jujuy|catamarca|santiago del estero|la rioja)/.test(province)) return 'noroeste';
  if (/^(chubut|neuquen|rio negro|santa cruz|tierra del fuego|la pampa)/.test(province)) return 'patagonia';
  if (/^(mendoza|cordoba|misiones|san juan|san luis|corrientes|chaco|formosa)/.test(province)) return 'cuyo';
  return 'otras';
}

// Los barrios de CABA se juntan en una sola «ciudad»: «CABA (Mataderos)» y «CABA (Almagro)» van seguidas.
export const cityLabel = (prospect = {}) => (/^caba\b/i.test(String(prospect.city || '')) ? 'CABA' : String(prospect.city || 'Sin ciudad').replace(/\s*\(.*\)\s*$/, '').trim() || 'Sin ciudad');

const FAMILY_ORDER = { Penosil: 1, Planchas: 2, Resinplast: 3 };

export function callPlan(prospects = [], { today = arToday(), blocked = () => false } = {}) {
  const zones = new Map(ZONES.map((zone) => [zone.id, { ...zone, total: 0, cities: new Map() }]));
  let total = 0;
  for (const prospect of Array.isArray(prospects) ? prospects : []) {
    const verdict = classifyProspect(prospect);
    if (verdict.status !== 'pendiente' || verdict.fit !== 'alta' || verdict.contact === 'sin-telefono') continue;
    if (blocked(prospect)) continue;
    if (prospect.lastCall?.date === today && prospect.lastCall?.result === 'no-atendio') continue; // «No atendió» se vuelve a ofrecer mañana
    const zone = zones.get(zoneOf(prospect));
    const key = `${cityLabel(prospect)}|${prospect.province || ''}`;
    if (!zone.cities.has(key)) zone.cities.set(key, { city: cityLabel(prospect), province: prospect.province || '', items: [] });
    zone.cities.get(key).items.push({ prospect, contact: verdict.contact, attempts: Number(prospect.callAttempts) || 0 });
    zone.total += 1;
    total += 1;
  }
  const out = [...zones.values()].filter((zone) => zone.total).map((zone) => ({
    id: zone.id,
    name: zone.name,
    total: zone.total,
    cities: [...zone.cities.values()]
      .map((city) => ({ ...city, count: city.items.length, items: city.items.sort((a, b) => (FAMILY_ORDER[a.prospect.family] || 9) - (FAMILY_ORDER[b.prospect.family] || 9) || String(a.prospect.company).localeCompare(String(b.prospect.company), 'es')) }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'es')),
  }));
  const calledToday = (Array.isArray(prospects) ? prospects : []).filter((item) => item?.lastCall?.date === today).length;
  return { zones: out, total, calledToday };
}

// Anota el resultado de una llamada en el prospecto. «hablamos» y «sin-interes» además se marcan con markProspect desde la pantalla
// (así se convierte en Empresa y queda el seguimiento); «mail» solo guarda el mail.
export function noteCall(state, id, result, { user = '', today = arToday(), now = new Date().toISOString(), email = '' } = {}) {
  const mail = String(email || '').trim().toLowerCase();
  const mailOk = mail && checkEmail(mail).valid;
  return {
    ...state,
    prospects: (state.prospects || []).map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, updatedAt: now };
      if (mailOk) next.email = mail;
      if (result === 'mail') return next;
      next.lastCall = { date: today, result, by: user, at: now };
      if (result === 'no-atendio') {
        next.callAttempts = (Number(item.callAttempts) || 0) + 1;
        next.history = [...(Array.isArray(item.history) ? item.history : []), { at: now, state: item.state, outcome: 'No atendió (llamada)', user, family: item.family || '', zone: item.zone || '' }].slice(-40);
      }
      return next;
    }),
  };
}
