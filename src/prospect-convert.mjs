// Conversión de un prospecto en Empresa del CRM. Desde ahí rige toda la lógica
// del CRM (etapas, temperatura, tareas): Prospección no maneja estados
// comerciales propios después de convertir. Si ya existía la empresa, se vincula
// y NO se duplica; solo se completan los campos vacíos.
import { familyConfig, CONVERTING_STATES, setProspectState } from './prospect-model.mjs';
import { matchProspect } from './prospect-dedupe.mjs';

const FILLABLE = ['phone', 'email', 'website', 'province', 'city', 'address', 'instagram', 'facebook', 'contact', 'machine', 'currentSupplier', 'notes'];

function fillEmpty(client, prospect) {
  const next = { ...client };
  for (const field of FILLABLE) {
    if (!String(next[field] ?? '').trim() && String(prospect[field] ?? '').trim()) next[field] = prospect[field];
  }
  return next;
}

// Observaciones de la planilla + lo que quedó pendiente (propuesta, próxima acción).
function notesFrom(prospect) {
  const imported = prospect.imported || {};
  return [
    prospect.notes,
    imported.proposal && `Producto / propuesta: ${imported.proposal}`,
    imported.potentialValue && `Valor potencial: ${imported.potentialValue}`,
    imported.nextAction && `Próxima acción: ${imported.nextAction}${imported.nextDate ? ` (${imported.nextDate})` : ''}`,
  ].filter(Boolean).join(' · ');
}

export function clientFromProspect(prospect, { id, businessUnit = '', now = new Date().toISOString() } = {}) {
  const family = familyConfig(prospect.family)?.crmFamily || 'Sin definir';
  return {
    id,
    company: prospect.company,
    contact: prospect.contact || '',
    machine: prospect.machine || '',
    currentSupplier: prospect.currentSupplier || '',
    notes: notesFrom(prospect),
    phone: prospect.phone || '',
    email: prospect.email || '',
    website: prospect.website || '',
    province: prospect.province || '',
    city: prospect.city || '',
    address: prospect.address || '',
    instagram: prospect.instagram || '',
    facebook: prospect.facebook || '',
    family,
    industry: prospect.rubro || 'Desconocida',
    sourceType: 'Prospección',
    businessUnit,
    clientType: 'Desconocido',
    temperature: 'Frío',
    stage: 'Apertura',
    fit: 'A confirmar',
    urgency: 'A confirmar',
    potential: 'Hipótesis media',
    pipelineActive: true,
    lastContact: now.slice(0, 10),
    prospectId: prospect.id,
    createdAt: now,
    updatedAt: now,
  };
}

// Marca el estado del prospecto y, si corresponde (Contactado o Con interés),
// lo convierte en Empresa. Devuelve el workspace nuevo y qué pasó.
export function markProspect(state, prospectId, nextState, { outcome = '', user = '', newClientId, businessUnit = '', now = new Date().toISOString() } = {}) {
  const prospects = Array.isArray(state.prospects) ? state.prospects : [];
  const prospect = prospects.find((item) => item.id === prospectId);
  if (!prospect) return { state, result: 'no_encontrado' };
  const marked = setProspectState(prospect, nextState, outcome, now, user);
  const clients = Array.isArray(state.clients) ? state.clients : [];
  let result = 'marcado';
  let nextClients = clients;
  let linkedClientId = marked.linkedClientId || '';

  if (CONVERTING_STATES.includes(nextState) && !linkedClientId) {
    const match = matchProspect(marked, clients);
    if (match.status === 'Ya en el CRM' && match.bestClient) {
      linkedClientId = match.bestClient.id;
      nextClients = clients.map((item) => (item.id === linkedClientId ? { ...fillEmpty(item, marked), prospectId: marked.id, updatedAt: now } : item));
      result = 'vinculado';
    } else {
      linkedClientId = newClientId;
      nextClients = [...clients, clientFromProspect(marked, { id: newClientId, businessUnit, now })];
      result = 'convertido';
    }
  }
  const finalProspect = { ...marked, linkedClientId };
  return {
    state: { ...state, clients: nextClients, prospects: prospects.map((item) => (item.id === prospectId ? finalProspect : item)) },
    result,
    linkedClientId,
  };
}
