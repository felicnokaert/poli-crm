// Señales leídas del sitio web de un prospecto (idea tomada de Harvey, 30/10). Puro y testeado, sin IA ni costo.
// Cada señal dice QUÉ encontró; los puntos que suma salen de las reglas editables (Prospección → Reglas).
import { COMPETITORS } from './prospect-model.mjs';

const norm = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Rubros de Poliplast: si el sitio los nombra, probablemente usa o vende algo parecido.
export const SIGNAL_RUBROS = ['espuma', 'poliuretano', 'poliurea', 'aislacion', 'impermeabilizacion', 'pileta', 'fibra de vidrio', 'resina', 'balde', 'pintura'];
// Palabras de quien aplica o instala (red RAPYP).
export const SIGNAL_APPLICATOR = ['aplicamos', 'aplicador', 'aplicadores', 'instalamos', 'instalador', 'instalacion', 'colocacion', 'colocamos', 'mano de obra', 'obras', 'servicio de'];

const has = (plain, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/ /g, '\\s+')}`).test(plain);

export function detectSignals(texts = []) {
  const plain = norm((Array.isArray(texts) ? texts.map((item) => (typeof item === 'string' ? item : item?.text || '')).join(' \n ') : String(texts)));
  const signals = [];
  const rubros = SIGNAL_RUBROS.filter((word) => has(plain, word));
  if (rubros.length) signals.push({ key: 'rubros', label: 'Su sitio nombra nuestros rubros', found: rubros });
  const applicator = SIGNAL_APPLICATOR.filter((word) => has(plain, word));
  if (applicator.length) signals.push({ key: 'aplicador', label: 'Parece aplicador o instalador', found: applicator });
  const competitors = COMPETITORS.filter((name) => plain.includes(norm(name)));
  if (competitors.length) signals.push({ key: 'competidor', label: 'Menciona a un competidor (ya compra en el rubro)', found: competitors });
  return signals;
}

// Puntos que suman las señales con las reglas vigentes: rubros por cada uno (tope 3), aplicador y competidor una vez.
export function signalPoints(signals = [], rules = {}) {
  let points = 0;
  for (const signal of signals || []) {
    if (signal.key === 'rubros') points += Math.min(3, signal.found?.length || 0) * (rules.signalRubros ?? 1);
    else if (signal.key === 'aplicador') points += rules.signalApplicator ?? 3;
    else if (signal.key === 'competidor') points += rules.signalCompetitor ?? 1;
  }
  return points;
}
