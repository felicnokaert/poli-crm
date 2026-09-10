import { COMMERCIAL_STAGES, ECERA, OBJECTIONS, playbooksForFamily } from './commercial-knowledge.mjs';

const PIPELINE_TO_METHOD = {
  nuevo: 'preparacion', contactado: 'apertura', conversacion: 'diagnostico', calificado: 'calificacion',
  propuesta: 'propuesta', negociacion: 'negociacion', ganado: 'posventa', pausado: 'seguimiento', perdido: 'seguimiento',
};

const OBJECTION_TERMS = {
  precio: ['caro', 'precio', 'más barato', 'mas barato', 'presupuesto'],
  proveedor: ['proveedor', 'ya compro', 'siempre compro'],
  informacion: ['mandame información', 'mandame informacion', 'pasame info', 'catálogo', 'catalogo'],
  pensar: ['pensar', 'consultar', 'lo veo', 'te aviso'],
  momento: ['no es el momento', 'más adelante', 'mas adelante', 'todavía no', 'todavia no'],
  rendimiento: ['sirve', 'rinde', 'rendimiento', 'funciona', 'compatib'],
  escala: ['necesito poco', 'poca cantidad', 'solo uno', 'una unidad'],
  marca: ['no conozco', 'confianza', 'marca'],
  decisor: ['lo decide', 'consultar con', 'hablar con mi'],
  entrega: ['urgente', 'entrega', 'para hoy', 'para mañana', 'para manana'],
  pago: ['pago', 'financ', 'cuenta corriente', 'cheque'],
  prueba: ['probar', 'prueba', 'muestra'],
  silencio: ['sin respuesta', 'no respondió', 'no respondio'],
};

function clean(value = '') {
  return String(value)
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function methodStageFor(client = {}) {
  const explicit = clean(client.methodStage || client.commercialMethodStage);
  return COMMERCIAL_STAGES.find((item) => clean(item.label) === explicit || item.id === explicit)
    || COMMERCIAL_STAGES.find((item) => item.id === PIPELINE_TO_METHOD[clean(client.stage)])
    || COMMERCIAL_STAGES[0];
}

export function detectObjection(text = '') {
  const value = clean(text);
  if (!value) return null;
  const match = Object.entries(OBJECTION_TERMS).find(([, terms]) => terms.some((term) => value.includes(term)));
  return match ? OBJECTIONS.find((item) => item.id === match[0]) || null : null;
}

export function buildCommercialGuidance({ client = {}, interactions = [] } = {}) {
  const latest = [...interactions].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || {};
  const family = client.family || latest.family || '';
  const playbooks = family && family !== 'Sin definir' ? playbooksForFamily(family).filter((item) => item.id !== 'mercadolibre') : [];
  const explicitObjection = latest.objection || client.objection || '';
  const objection = detectObjection(explicitObjection) || detectObjection([latest.summary, latest.need].filter(Boolean).join(' '));
  const stage = methodStageFor(client);
  const primaryPlaybook = playbooks[0] || null;
  return {
    stage,
    playbook: primaryPlaybook,
    objection,
    ecera: objection ? ECERA : [],
    nextQuestion: objection?.explore || primaryPlaybook?.nextStep || stage.advanceWhen,
    crossSellFamilies: primaryPlaybook ? primaryPlaybook.families.filter((item) => item !== String(family).toLocaleUpperCase('es-AR')) : [],
    reasons: [
      client.stage ? `Etapa actual: ${client.stage}` : 'Etapa no informada: se usa Preparación',
      family && family !== 'Sin definir' ? `Familia registrada: ${family}` : 'Familia pendiente: no se asigna un perfil',
      objection ? `Objeción detectada: ${objection.label}` : 'Sin objeción detectada',
    ],
    source: stage.source,
  };
}
