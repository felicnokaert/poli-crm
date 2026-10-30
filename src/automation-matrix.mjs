// Matriz de automatizaciones (28/10, Felipe: "si yo fuese gerente de operaciones, cómo decido qué hay que hacer"): cada idea se puntúa por
// IMPACTO sobre el negocio, FACILIDAD de hacerla y COSTO estimado, y el veredicto sale solo:
//   Automatizar ya · Quick win opcional · Copiloto (IA + humano) · No automatizar.
// No es la matriz de Eisenhower (urgente × importante) sino una de impacto × esfuerzo, con el costo como tercera variable.
// Todo es puro y sin red. Lo editado se guarda en el espacio de Felipe (data.automations: mapa id → cambios).

export const VERDICTS = {
  ya: { label: 'Automatizar ya', color: '#0d7764', help: 'Impacto alto, fácil y barato, sin riesgo: hacerlo.' },
  copiloto: { label: 'Copiloto (IA + humano)', color: '#2563eb', help: 'Impacto alto, pero difícil, caro o riesgoso: la IA propone y una persona decide.' },
  quick: { label: 'Quick win opcional', color: '#d97706', help: 'Impacto medio o bajo, pero fácil y barato: si sobra tiempo.' },
  no: { label: 'No automatizar', color: '#7d8790', help: 'Poco impacto y difícil o caro: no vale la pena.' },
};
export const VERDICT_ORDER = ['ya', 'copiloto', 'quick', 'no'];
export const COSTS = [
  { value: 0, label: 'Gratis' },
  { value: 1, label: 'Bajo (centavos o minutos)' },
  { value: 2, label: 'Medio (IA con volumen o un servicio)' },
  { value: 3, label: 'Alto (herramienta paga o muchas horas)' },
];
export const STATUSES = { hecho: 'Hecho', 'en-curso': 'En curso', pendiente: 'Pendiente' };

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

// Veredicto de una idea. Riesgo = envía algo al cliente o escribe en un sistema sin pasar por una persona; humano = la IA propone y alguien decide.
export function verdictFor(idea = {}) {
  const impact = clamp(idea.impact, 1, 5, 3);
  const ease = clamp(idea.ease, 1, 5, 3);
  const cost = clamp(idea.cost, 0, 3, 1);
  const feasible = ease >= 3 && cost <= 1;
  const guarded = Boolean(idea.risk || idea.human);
  if (impact >= 3 && (guarded || !feasible)) return 'copiloto';
  if (impact >= 4 && feasible && !guarded) return 'ya';
  if (feasible && !guarded) return 'quick';
  return 'no';
}

// Ideas de partida (lo que venimos hablando). Los puntajes son una primera estimación de Claude: Felipe los edita.
export const SEED_IDEAS = [
  { id: 'wa-alerta-linea', name: 'Aviso diario si una línea de WhatsApp se desconecta', area: 'WhatsApp', impact: 5, ease: 5, cost: 0, status: 'hecho' },
  { id: 'wa-reparto', name: 'Reparto automático de cada WhatsApp a quien corresponde (Juan, Ezequiel, Brenda…)', area: 'WhatsApp', impact: 4, ease: 4, cost: 0, status: 'pendiente' },
  { id: 'wa-clasificar', name: 'Clasificar por familia y prioridad cada WhatsApp que entra', area: 'WhatsApp', impact: 4, ease: 3, cost: 1, status: 'en-curso' },
  { id: 'wa-tarea-cotizacion', name: 'Crear la tarea de seguimiento cuando entra una consulta de cotización', area: 'WhatsApp', impact: 4, ease: 4, cost: 0, status: 'pendiente' },
  { id: 'wa-sugerida', name: 'Respuesta sugerida en WhatsApp (borrador: la envía una persona)', area: 'WhatsApp', impact: 4, ease: 3, cost: 1, human: true, status: 'pendiente' },
  { id: 'wa-bot', name: 'Bot que responde solo en WhatsApp', area: 'WhatsApp', impact: 4, ease: 2, cost: 3, risk: true, status: 'pendiente' },
  { id: 'redes-leer', name: 'Leer mensajes y comentarios de Facebook e Instagram en Por revisar', area: 'Redes', impact: 4, ease: 2, cost: 0, status: 'pendiente' },
  { id: 'redes-agente', name: 'Agente que responde solo en Facebook e Instagram (temas seguros)', area: 'Redes', impact: 5, ease: 2, cost: 2, risk: true, human: true, status: 'pendiente' },
  { id: 'prosp-senales', name: 'Puntaje de prospectos por señales del sitio web (rubros, aplicador, tienda, sucursales, contratando)', area: 'Prospección', impact: 4, ease: 4, cost: 0, status: 'hecho' },
  { id: 'prosp-nocontactar', name: 'Lista de No contactar que filtra las colas y todo envío', area: 'Prospección', impact: 3, ease: 5, cost: 0, status: 'hecho' },
  { id: 'prosp-mail-borrador', name: 'Mail en 3 pasos por prospecto en bandeja de salida (lo aprueba y manda una persona)', area: 'Prospección', impact: 5, ease: 4, cost: 0, human: true, status: 'en-curso' },
  { id: 'prosp-mail-envio', name: 'Envío de mails desde la cuenta de cada persona, con límite diario, baja y pausa', area: 'Prospección', impact: 5, ease: 2, cost: 1, risk: true, human: true, status: 'pendiente' },
  { id: 'prosp-respuestas', name: 'Leer y clasificar respuestas a los mails; las bajas pasan solas a No contactar', area: 'Prospección', impact: 4, ease: 3, cost: 1, human: true, status: 'pendiente' },
  { id: 'cotiz-seguimiento', name: 'Seguimiento automático de cotizaciones sin respuesta (tarea a 2 días)', area: 'Ventas', impact: 4, ease: 5, cost: 0, status: 'hecho' },
  { id: 'cola-reactivar', name: 'Cola del día: reactivar clientes que dejaron de comprar', area: 'Ventas', impact: 5, ease: 4, cost: 0, status: 'hecho' },
  { id: 'resumen-semana', name: 'Resumen de la semana para Felipe y David', area: 'Ventas', impact: 3, ease: 5, cost: 0, status: 'hecho' },
  { id: 'plan-trello', name: 'Plan del día en Trello a partir de las alertas', area: 'Operación', impact: 3, ease: 5, cost: 0, status: 'hecho' },
  { id: 'ml-reputacion', name: 'Alerta de reputación y de publicaciones sin stock en Mercado Libre', area: 'Mercado Libre', impact: 4, ease: 5, cost: 0, status: 'hecho' },
  { id: 'ml-preguntas', name: 'Responder preguntas de Mercado Libre desde el CRM', area: 'Mercado Libre', impact: 3, ease: 2, cost: 2, risk: true, status: 'pendiente' },
  { id: 'ml-clips', name: 'Cargar qué publicaciones tienen clip (la API no lo da)', area: 'Mercado Libre', impact: 2, ease: 2, cost: 0, status: 'pendiente' },
  { id: 'shopify-carritos', name: 'Email de recuperación de carritos abandonados (función de Shopify)', area: 'Shopify', impact: 4, ease: 4, cost: 0, status: 'pendiente' },
  { id: 'shopify-descripciones', name: 'Descripciones y metacampos de Shopify desde Mercado Libre (borrador para aprobar)', area: 'Shopify', impact: 3, ease: 4, cost: 0, human: true, status: 'en-curso' },
  { id: 'shopify-precios', name: 'Precio de Shopify = precio de ML menos 10 % (proponer y aprobar)', area: 'Shopify', impact: 3, ease: 3, cost: 0, risk: true, status: 'en-curso' },
  { id: 'stock-sync', name: 'Sincronizar stock entre Mercado Libre y Shopify', area: 'Shopify', impact: 3, ease: 2, cost: 1, risk: true, status: 'pendiente' },
];

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Une las ideas de partida con lo que Felipe editó o agregó. saved: { [id]: { ...campos, custom?: true, removed?: true } }.
export function mergeIdeas(saved = {}) {
  const base = SEED_IDEAS.map((idea) => ({ ...idea, ...(saved[idea.id] || {}), id: idea.id, custom: false }));
  const custom = Object.entries(saved || {})
    .filter(([id, row]) => row?.custom && !SEED_IDEAS.some((idea) => idea.id === id))
    .map(([id, row]) => ({ id, name: text(row.name, 140) || 'Idea sin nombre', area: text(row.area, 40) || 'Otras', impact: 3, ease: 3, cost: 1, status: 'pendiente', ...row, custom: true }));
  return [...base, ...custom]
    .filter((idea) => !idea.removed)
    .map((idea) => ({
      ...idea,
      impact: clamp(idea.impact, 1, 5, 3), ease: clamp(idea.ease, 1, 5, 3), cost: clamp(idea.cost, 0, 3, 1),
      risk: Boolean(idea.risk), human: Boolean(idea.human),
      status: STATUSES[idea.status] ? idea.status : 'pendiente',
      verdict: verdictFor(idea),
    }));
}

// Cambia una idea y devuelve el mapa nuevo para guardar.
export function patchIdea(saved = {}, id, patch = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (['impact', 'ease'].includes(key)) clean[key] = clamp(value, 1, 5, 3);
    else if (key === 'cost') clean.cost = clamp(value, 0, 3, 1);
    else if (['risk', 'human', 'removed'].includes(key)) clean[key] = Boolean(value);
    else if (key === 'status') clean.status = STATUSES[value] ? value : 'pendiente';
    else if (key === 'name') clean.name = text(value, 140);
    else if (key === 'area') clean.area = text(value, 40);
  }
  return { ...saved, [id]: { ...(saved[id] || {}), ...clean } };
}

export function newIdea(saved = {}, { name, area = 'Otras', impact = 3, ease = 3, cost = 1 } = {}) {
  const title = text(name, 140);
  if (!title) return saved;
  const id = `custom-${Date.now().toString(36)}-${Object.keys(saved).length}`;
  return { ...saved, [id]: { custom: true, name: title, area: text(area, 40) || 'Otras', impact: clamp(impact, 1, 5, 3), ease: clamp(ease, 1, 5, 3), cost: clamp(cost, 0, 3, 1), status: 'pendiente' } };
}

// Resumen por veredicto, para las tarjetas de arriba.
export function verdictCounts(ideas = []) {
  return Object.fromEntries(VERDICT_ORDER.map((key) => [key, ideas.filter((idea) => idea.verdict === key).length]));
}

// Orden de la lista: primero lo que conviene hacer ya, y adentro de cada veredicto lo de más impacto y más fácil.
export function sortIdeas(ideas = []) {
  return [...ideas].sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || b.impact - a.impact || b.ease - a.ease || a.cost - b.cost || a.name.localeCompare(b.name));
}

// Posición de cada burbuja en el gráfico (en %): facilidad hacia la derecha, impacto hacia arriba; los empates se corren un poco.
export function bubblePositions(ideas = []) {
  const seen = new Map();
  return ideas.map((idea, index) => {
    const slot = `${idea.ease}|${idea.impact}`;
    const n = seen.get(slot) || 0;
    seen.set(slot, n + 1);
    const jitterX = ((n % 3) - 1) * 4.2;
    const jitterY = (Math.floor(n / 3) % 3 - 1) * 4.2;
    return { id: idea.id, number: index + 1, left: ((idea.ease - 1) / 4) * 84 + 8 + jitterX, bottom: ((idea.impact - 1) / 4) * 84 + 8 + jitterY, size: 18 + idea.cost * 7 };
  });
}
