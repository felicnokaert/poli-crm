// Borrador de primer contacto para un prospecto. Se arma sin IA con la guía comercial de
// Academia (qué le importa a ese tipo de cliente) y los datos reales de la ficha.
// Es solo un texto para copiar y editar: el CRM nunca envía mensajes.
import { PLAYBOOKS } from './commercial-knowledge.mjs';

const ASK = {
  aplicadores: 'qué material y qué máquina usan hoy y qué les gustaría mejorar',
  fabricantes: 'qué volumen y qué especificación manejan hoy y cómo les va con el plazo de entrega',
  distribuidores: 'qué líneas revenden hoy y qué les falta en el surtido',
  constructoras: 'qué tipo de obras tienen y qué especificación técnica les piden',
  frigorificas: 'qué espesores y densidades trabajan y qué exigencias técnicas tienen',
  carrozados: 'qué insumos compran hoy y a cuántos proveedores',
  prfv: 'qué fabrican o reparan y con qué resina y refuerzo trabajan',
  penosil: 'qué marcas de selladores y espumas tienen hoy y cómo rotan',
};

function plain(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function playbookFor(prospect = {}) {
  const family = plain(prospect.family);
  const rubro = plain(prospect.rubro);
  const pick = (id) => PLAYBOOKS.find((item) => item.id === id) || null;
  if (/ferreter|corralon|pintureria|mayorista|distribuidor/.test(rubro) || family === 'penosil') return pick(/distribuidor/.test(rubro) ? 'distribuidores' : 'penosil');
  if (/frigorific|panel|camara|isotermic/.test(rubro) || family === 'planchas') return pick('frigorificas');
  if (/astillero|piscina|tanque|fibra de vidrio/.test(rubro) || family === 'resinplast') return pick('prfv');
  if (/carroc|furgon|acoplado|motorhome/.test(rubro) || family.startsWith('carrozados')) return pick('carrozados');
  if (/aplicador|proyect|impermeab|pintura industrial/.test(rubro) || ['purmac', 'poliurea', 'poliuretano'].includes(family)) return pick('aplicadores');
  if (/construct|aislacion/.test(rubro)) return pick('constructoras');
  return pick('fabricantes');
}

// "Por qué encaja: …" guardado por la investigación en las notas de la ficha.
export function fitLine(prospect = {}) {
  const match = String(prospect.notes || '').match(/Por qué encaja:\s*([^\n]+)/i);
  return match ? match[1].trim().replace(/[.\s]+$/, '') : '';
}

function lower(text = '') {
  return text ? text.charAt(0).toLocaleLowerCase('es-AR') + text.slice(1) : '';
}

export function buildOutreachDraft(prospect = {}, { sender = '' } = {}) {
  const book = playbookFor(prospect);
  const company = String(prospect.company || '').trim() || 'su empresa';
  const where = String(prospect.city || '').trim();
  const rubro = String(prospect.rubro || '').trim();
  const fit = fitLine(prospect);
  const who = String(sender || '').trim() || '[tu nombre]';
  const context = [rubro && `trabajan en ${rubro}`, where && `en ${where}`].filter(Boolean).join(' ');
  const opening = `Hola, ¿hablo con ${company}? Soy ${who} de Grupo Poliplast.`;
  const reason = fit ? `Vi que ${lower(fit)}.` : context ? `Vi que ${context}.` : '';
  const value = book ? `Lo que más valoran empresas del rubro: ${lower(book.motivation).replace(/\.$/, '')}.` : '';
  const ask = `¿Me podrían contar ${book ? ASK[book.id] : 'qué usan hoy y qué volumen manejan'}? Con eso les cuento si podemos ayudarlos, sin compromiso.`;
  const whatsapp = [opening, reason, value, ask].filter(Boolean).join(' ');
  const email = {
    subject: `Grupo Poliplast · ${rubro || 'consulta'} para ${company}`.slice(0, 90),
    body: [`Hola, buenos días.`, '', [`Soy ${who} de Grupo Poliplast.`, reason].filter(Boolean).join(' '), value, '', ask, '', 'Quedo atento.', who].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')).join('\n'),
  };
  const call = book ? [
    `1) Presentate: ${who} de Grupo Poliplast, y por qué llamás${reason ? ` (${reason.replace(/\.$/, '').toLocaleLowerCase('es-AR')})` : ''}.`,
    `2) Preguntá ${ASK[book.id]}. No hables de precios primero.`,
    `3) Si dicen "${book.typicalObjection.replace(/\.$/, '')}": no discutas, seguí preguntando.`,
    `4) Próximo paso sugerido: ${lower(book.nextStep).replace(/\.$/, '')}.`,
  ].join('\n') : '';
  return { playbook: book, whatsapp, email, call, usesResearch: Boolean(fit), missing: [!rubro && 'rubro', !where && 'ciudad'].filter(Boolean) };
}
