// Reglas de prospección editables (24/10): antes se cambiaban solo en el código. Los valores de fábrica son los de siempre;
// lo que se edita se guarda en el espacio de cada persona (data.prospectRules) y se aplica al orden de la cola y al radio de búsqueda.
export const DEFAULT_RULES = {
  phone: 3, whatsapp: 1, website: 2, email: 2, social: 1, evidence: 2, family: 1, duplicate: 2,
  fitHigh: 3, fitMedium: 1, zoneA: 2, zoneB: 1, sheetScoreMax: 4,
  radiusBig: 10, radiusLarge: 9, radiusMedium: 7, radiusSmall: 5,
  populationBig: 500000, populationLarge: 100000, populationMedium: 30000,
};

// Grupos para la pantalla: [clave, título, unidad, mínimo, máximo].
export const RULE_GROUPS = [
  ['Datos de contacto (puntos que suma cada dato)', [
    ['phone', 'Tiene teléfono', 'puntos', 0, 10], ['whatsapp', 'Parece WhatsApp', 'puntos', 0, 10], ['website', 'Tiene sitio web', 'puntos', 0, 10],
    ['email', 'Tiene mail', 'puntos', 0, 10], ['social', 'Tiene Instagram o Facebook', 'puntos', 0, 10], ['evidence', 'Anotada con evidencia', 'puntos', 0, 10],
    ['family', 'Tiene familia asignada', 'puntos', 0, 10], ['duplicate', 'Posible duplicado (resta)', 'puntos', 0, 20],
  ]],
  ['Lo que dice la planilla de Felipe', [
    ['fitHigh', 'Encaje Alto', 'puntos', 0, 10], ['fitMedium', 'Encaje Medio', 'puntos', 0, 10], ['zoneA', 'Zona A', 'puntos', 0, 10], ['zoneB', 'Zona B', 'puntos', 0, 10],
    ['sheetScoreMax', 'Tope por el puntaje de la planilla', 'puntos', 0, 10],
  ]],
  ['Radio de búsqueda según el tamaño de la ciudad', [
    ['radiusBig', 'Ciudad grande', 'km', 1, 30], ['populationBig', '…desde (habitantes)', 'hab.', 1000, 5000000],
    ['radiusLarge', 'Ciudad mediana-grande', 'km', 1, 30], ['populationLarge', '…desde (habitantes)', 'hab.', 1000, 5000000],
    ['radiusMedium', 'Ciudad mediana', 'km', 1, 30], ['populationMedium', '…desde (habitantes)', 'hab.', 1000, 5000000],
    ['radiusSmall', 'Ciudad chica (el resto)', 'km', 1, 30],
  ]],
];

const LIMITS = Object.fromEntries(RULE_GROUPS.flatMap(([, fields]) => fields.map(([key, , , min, max]) => [key, [min, max]])));

// Acepta lo guardado (puede venir incompleto o con basura) y devuelve reglas válidas: lo que falta o no es número usa el valor de fábrica.
export function normalizeRules(input = {}) {
  const out = { ...DEFAULT_RULES };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(input?.[key]);
    if (input?.[key] !== undefined && input?.[key] !== '' && Number.isFinite(value)) out[key] = Math.min(max, Math.max(min, Math.round(value)));
  }
  return out;
}

export const isDefault = (rules) => Object.entries(DEFAULT_RULES).every(([key, value]) => normalizeRules(rules)[key] === value);
// Solo se guardan las diferencias con los valores de fábrica.
export function changedRules(rules) {
  const full = normalizeRules(rules);
  return Object.fromEntries(Object.entries(full).filter(([key, value]) => value !== DEFAULT_RULES[key]));
}
