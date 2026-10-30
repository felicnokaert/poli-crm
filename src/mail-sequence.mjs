// Etapa 2 del plan estilo Harvey (30/10): secuencia de 3 mails por prospecto, que queda como BORRADOR en la Bandeja de salida.
// Nada se envía desde acá: una persona aprueba, copia o abre cada mail en su correo. Puro y testeado.
import { buildOutreachDraft } from './prospect-outreach.mjs';
import { blockedBy } from './do-not-contact.mjs';

export const OUTBOX_STATES = ['borrador', 'aprobado', 'enviado', 'descartado'];
export const STEPS = [{ step: 1, day: 0, name: 'Primer contacto' }, { step: 2, day: 3, name: 'Recordatorio' }, { step: 3, day: 7, name: 'Cierre' }];

const lower = (text = '') => String(text).charAt(0).toLocaleLowerCase('es-AR') + String(text).slice(1);
const FOOTER = (who) => `\n\n${who}\nGrupo Poliplast\nSi preferís no recibir más mensajes nuestros, respondé "BAJA" y no te escribimos más.`;

// Una frase con lo específico que se encontró en el sitio de la empresa (señales); sin señales no inventa nada.
export function signalLine(prospect = {}) {
  const signals = prospect.research?.signals || [];
  const find = (key) => signals.find((item) => item.key === key);
  const applicator = find('aplicador'); const rubros = find('rubros'); const store = find('tienda');
  if (applicator) return 'Vi en su sitio que trabajan con aplicación e instalación.';
  if (rubros?.found?.length) return `Vi en su sitio que trabajan con ${rubros.found.slice(0, 2).join(' y ')}.`;
  if (store) return 'Vi que venden online y por eso les escribo.';
  return '';
}

export function buildMailSequence(prospect = {}, { sender = '' } = {}) {
  const base = buildOutreachDraft(prospect, { sender });
  const who = String(sender || '').trim() || '[tu nombre]';
  const company = String(prospect.company || '').trim() || 'su empresa';
  const specific = signalLine(prospect);
  const first = specific ? base.email.body.replace(/^(Hola, buenos días\.\n\n)/, `$1${specific} `) : base.email.body;
  const step2Body = `Hola, buenos días.\n\n${who} de Grupo Poliplast otra vez. Les escribí hace unos días por ${company}.\n${base.playbook ? `Les dejo algo concreto: ${lower(base.playbook.nextStep).replace(/\.$/, '')}. ¿Lo vemos?` : '¿Les sirve que lo veamos?'}\nSi ahora no es momento, avísenme cuándo les conviene que retome.`;
  const step3Body = `Hola, buenos días.\n\nNo quiero molestar: esta es mi última nota por ahora. Si en algún momento necesitan ${base.playbook ? 'cotizar o comparar proveedores' : 'una opción de proveedor'}, pueden escribirme directo a este mail.\nGracias por su tiempo.`;
  const subject = base.email.subject;
  return [
    { step: 1, day: 0, name: 'Primer contacto', subject, body: `${first.replace(/\n+Quedo atento\.[\s\S]*$/, '\n\nQuedo atento.')}${FOOTER(who)}` },
    { step: 2, day: 3, name: 'Recordatorio', subject: `Re: ${subject}`, body: `${step2Body}\n\nSaludos,${FOOTER(who)}` },
    { step: 3, day: 7, name: 'Cierre', subject: `Re: ${subject}`, body: `${step3Body}\n\nSaludos,${FOOTER(who)}` },
  ];
}

const addDays = (iso, days) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// Arma los 3 borradores y los suma a la bandeja. No duplica (un prospecto con borradores vigentes no se vuelve a armar) y respeta No contactar.
export function queueSequence(outbox = [], prospect = {}, { sender = '', blocked = [], now = new Date().toISOString(), by = '' } = {}) {
  const list = Array.isArray(outbox) ? outbox : [];
  if (!String(prospect.email || '').includes('@')) return { outbox: list, added: 0, reason: 'sin mail' };
  if (blockedBy(prospect, blocked)) return { outbox: list, added: 0, reason: 'en la lista de No contactar' };
  if (list.some((item) => item.prospectId === prospect.id && item.state !== 'descartado')) return { outbox: list, added: 0, reason: 'ya tiene mails armados' };
  const entries = buildMailSequence(prospect, { sender }).map((mail) => ({
    id: `${prospect.id}:${mail.step}`, prospectId: prospect.id, company: prospect.company || '', to: String(prospect.email).trim(),
    step: mail.step, stepName: mail.name, subject: mail.subject, body: mail.body, dueOn: addDays(now, mail.day), state: 'borrador', createdAt: now, updatedAt: now, by,
  }));
  const rest = list.filter((item) => !(item.prospectId === prospect.id && item.state === 'descartado'));
  return { outbox: [...rest, ...entries], added: entries.length, reason: '' };
}

export const updateMail = (outbox = [], id, patch = {}, now = new Date().toISOString()) => (outbox || []).map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item));

// Solo se puede avanzar si el destinatario NO está en No contactar; si lo está, el borrador se descarta.
export function guardOutbox(outbox = [], blocked = [], now = new Date().toISOString()) {
  return (outbox || []).map((item) => (item.state !== 'descartado' && item.state !== 'enviado' && blockedBy({ email: item.to, company: item.company }, blocked) ? { ...item, state: 'descartado', note: 'En No contactar', updatedAt: now } : item));
}

export function mergeOutbox(remote = [], local = []) {
  const map = new Map();
  for (const item of [...(remote || []), ...(local || [])]) {
    if (!item?.id) continue;
    const old = map.get(item.id);
    if (!old || String(item.updatedAt || '') >= String(old.updatedAt || '')) map.set(item.id, item);
  }
  return [...map.values()];
}

export const mailtoLink = (item) => `mailto:${encodeURIComponent(item.to)}?subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body)}`;

// Abre el borrador en Gmail (web) con la cuenta indicada (ej. felipe@grupopoliplast.com.ar): no hace falta tener un programa de correo instalado.
export const gmailLink = (item, account = '') => `https://mail.google.com/mail/?view=cm&fs=1${account ? `&authuser=${encodeURIComponent(account)}` : ''}&to=${encodeURIComponent(item.to)}&su=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body)}`;
