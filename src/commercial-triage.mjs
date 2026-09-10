export const TRIAGE_VARIABLES = [
  { id: 'relevance', label: 'Relevancia', question: '¿Encaja con los mercados y capacidades del grupo?', options: ['No encaja', 'Dudoso', 'Sí, encaja'] },
  { id: 'exposure', label: 'Exposición', question: '¿Qué pierde si no lo resuelve?', options: ['Baja', 'Media', 'Alta'] },
  { id: 'problem', label: 'Problema', question: '¿Existe una necesidad concreta?', options: ['No', 'Difusa', 'Clara'] },
  { id: 'urgency', label: 'Urgencia', question: '¿Hay una señal de apuro real?', options: ['Sin señal', 'Parcial', 'Explícita'] },
  { id: 'ticket', label: 'Ticket', question: '¿Cuál es el valor potencial?', options: ['Bajo', 'Medio', 'Alto'] },
  { id: 'activity', label: 'Actividad', question: '¿Responde y colabora para avanzar?', options: ['No responde', 'Parcial', 'Activa'] },
];

export function blankTriage() {
  return Object.fromEntries(TRIAGE_VARIABLES.map((item) => [item.id, null]));
}

export function scoreTriage(values = {}) {
  const known = TRIAGE_VARIABLES.filter((item) => {
    const value = values[item.id];
    return value !== null && value !== undefined && value !== '' && [0, 1, 2].includes(Number(value));
  });
  const score = known.reduce((total, item) => total + Number(values[item.id]), 0);
  const complete = known.length === TRIAGE_VARIABLES.length;
  let priority = 'Sin confirmar';
  if (complete) priority = score >= 9 ? 'A' : score >= 6 ? 'B' : score >= 3 ? 'C' : 'No perseguir';
  return { score, known: known.length, total: TRIAGE_VARIABLES.length, complete, priority };
}

export function suggestTriage(event = {}, relationship = 'A confirmar') {
  const text = String(event.text_body || '').toLocaleLowerCase('es-AR');
  const values = blankTriage();
  if (['Cliente actual', 'Prospecto'].includes(relationship)) values.relevance = 2;
  if (['Proveedor', 'Contacto personal', 'No comercial'].includes(relationship)) values.relevance = 0;
  if (/precio|cotiz|comprar|necesito|stock|reclamo|problema|no funciona|rendimiento|sirve para/.test(text)) values.problem = 2;
  else if (/informaci[oó]n|consulta|quisiera saber|quiero saber/.test(text)) values.problem = 1;
  if (/hoy|urgente|ma[ñn]ana|esta semana|cuanto antes|para el viernes/.test(text)) values.urgency = 2;
  // Existe actividad comprobable porque la persona inició o continuó el contacto.
  if (text.trim()) values.activity = 2;
  return values;
}
