// Agenda de conteo (27/11, Diego): qué día cuenta quién y qué familias (categorías completas). Se guarda en la configuración
// de Conteo (kv_store «config», campo «agenda»), la edita un administrador desde el panel y se muestra como «Hoy te toca contar…».
// Días: 1 = lunes … 5 = viernes (como Date.getDay; 28/11, Felipe: se trabaja de lunes a viernes, sin sábado). Precargado: jueves → Neyen; viernes → Marcos y Braian; familias vacías (las elige Diego).
export const DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };
export const DIAS_CORTO = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie' };
export const AGENDA_DEFAULT = { 4: { personas: ['Neyen'], familias: [] }, 5: { personas: ['Marcos', 'Braian'], familias: [] } };

/** Día de la semana en Argentina (0 = domingo). */
export function diaAR(fecha = new Date()) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' }).format(fecha);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
}

export function agendaDe(config) {
  const a = config && config.agenda && typeof config.agenda === 'object' ? config.agenda : AGENDA_DEFAULT;
  const out = {};
  Object.keys(DIAS).forEach((d) => {
    const x = a[d] || {};
    out[d] = { personas: Array.isArray(x.personas) ? x.personas.filter(Boolean) : [], familias: Array.isArray(x.familias) ? x.familias.filter(Boolean) : [] };
  });
  return out;
}

const sinAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mismo = (a, b) => sinAcento(a) === sinAcento(b) || sinAcento(a).split(' ')[0] === sinAcento(b).split(' ')[0];

/** Lo de hoy: { dia, personas, familias (ids), meToca } o null si hoy no hay conteo agendado. */
export function agendaHoy(config, persona, fecha = new Date()) {
  const d = diaAR(fecha);
  const x = agendaDe(config)[d];
  if (!x || (!x.personas.length && !x.familias.length)) return null;
  return { dia: DIAS[d], personas: x.personas, familias: x.familias, meToca: !!persona && x.personas.some((p) => mismo(p, persona)) };
}

/** Cambia una persona o familia de un día (agrega si no estaba, saca si estaba). Devuelve una agenda nueva. */
export function alternar(agenda, dia, campo, valor) {
  const a = agendaDe({ agenda });
  const lista = a[dia][campo];
  a[dia] = { ...a[dia], [campo]: lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor] };
  return a;
}
