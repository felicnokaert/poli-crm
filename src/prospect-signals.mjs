// Señales leídas del sitio web de un prospecto (idea tomada de Harvey, 30/10). Puro y testeado, sin IA ni costo.
// Cada señal dice QUÉ encontró; los puntos que suma salen de las reglas editables (Prospección → Reglas).
import { COMPETITORS } from './prospect-model.mjs';

const norm = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Rubros de Poliplast: si el sitio los nombra, probablemente usa o vende algo parecido.
export const SIGNAL_RUBROS = ['espuma', 'poliuretano', 'poliurea', 'aislacion', 'impermeabilizacion', 'pileta', 'fibra de vidrio', 'resina', 'balde', 'pintura'];
// Palabras de quien aplica o instala (red RAPYP).
export const SIGNAL_APPLICATOR = ['aplicamos', 'aplicador', 'aplicadores', 'instalamos', 'instalador', 'instalacion', 'colocacion', 'colocamos', 'mano de obra', 'obras', 'servicio de'];

// Empresa que vende online, tiene varias sucursales o está sumando gente: más actividad, más chances de comprar.
export const SIGNAL_STORE = ['carrito', 'tienda online', 'comprar online', 'envios a todo el pais', 'envios a domicilio'];
export const SIGNAL_BRANCHES = ['sucursales', 'nuestras sucursales', 'casa central', 'nuestros locales', 'puntos de venta'];
export const SIGNAL_HIRING = ['trabaja con nosotros', 'trabajá con nosotros', 'busqueda laboral', 'bolsa de trabajo', 'sumate a nuestro equipo', 'estamos buscando', 'unite al equipo'];

const has = (plain, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/ /g, '\\s+')}`).test(plain);

export function detectSignals(texts = []) {
  const plain = norm((Array.isArray(texts) ? texts.map((item) => (typeof item === 'string' ? item : item?.text || '')).join(' \n ') : String(texts)));
  const signals = [];
  const rubros = SIGNAL_RUBROS.filter((word) => has(plain, word));
  if (rubros.length) signals.push({ key: 'rubros', label: 'Su sitio nombra nuestros rubros', found: rubros });
  const applicator = SIGNAL_APPLICATOR.filter((word) => has(plain, word));
  if (applicator.length) signals.push({ key: 'aplicador', label: 'Parece aplicador o instalador', found: applicator });
  const store = SIGNAL_STORE.filter((word) => has(plain, norm(word)));
  if (store.length) signals.push({ key: 'tienda', label: 'Vende online (tienda o carrito)', found: store });
  const branches = SIGNAL_BRANCHES.filter((word) => has(plain, norm(word)));
  if (branches.length) signals.push({ key: 'sucursales', label: 'Tiene varias sucursales o locales', found: branches });
  const hiring = SIGNAL_HIRING.filter((word) => has(plain, norm(word)));
  if (hiring.length) signals.push({ key: 'contratando', label: 'Está sumando gente (empresa en movimiento)', found: hiring });
  const competitors = COMPETITORS.filter((name) => plain.includes(norm(name)));
  if (competitors.length) signals.push({ key: 'competidor', label: 'Menciona a un competidor (ya compra en el rubro)', found: competitors });
  return signals;
}

// Puntos que suman las señales con las reglas vigentes: rubros por cada uno (tope 3); el resto, una vez cada una.
export function signalPoints(signals = [], rules = {}) {
  let points = 0;
  for (const signal of signals || []) {
    if (signal.key === 'rubros') points += Math.min(3, signal.found?.length || 0) * (rules.signalRubros ?? 1);
    else if (signal.key === 'aplicador') points += rules.signalApplicator ?? 3;
    else if (signal.key === 'competidor') points += rules.signalCompetitor ?? 1;
    else if (signal.key === 'tienda') points += rules.signalStore ?? 1;
    else if (signal.key === 'sucursales') points += rules.signalBranches ?? 1;
    else if (signal.key === 'contratando') points += rules.signalHiring ?? 1;
  }
  return points;
}

// Reseñas del mapa (Google Maps): una empresa con buen puntaje y varias reseñas está activa. 10+ reseñas con 4 estrellas o más
// suma lo que diga la regla; con 50+ suma el doble. Sin datos de reseñas (OpenStreetMap no los trae) no suma nada.
export function reviewPoints(prospect = {}, rules = {}) {
  const rating = Number(prospect.rating);
  const reviews = Number(prospect.reviews);
  if (!(rating >= 4) || !(reviews >= 10)) return 0;
  return (rules.signalReviews ?? 1) * (reviews >= 50 ? 2 : 1);
}

export const reviewLabel = (prospect = {}) => (Number(prospect.reviews) > 0 && Number(prospect.rating) > 0 ? `${Number(prospect.rating).toFixed(1).replace('.', ',')} ★ · ${prospect.reviews} reseñas en el mapa` : '');
