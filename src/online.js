import { createClient } from '@supabase/supabase-js';
import { filterDismissedEvents, isLegacyWhatsAppPreview } from './whatsapp-events.mjs';
import { whatsappContactIdentity, whatsappContactKey } from './whatsapp-threads.mjs';
export { completeTasksThrough, mergeClients, mergeWorkspaceState, recordDeletions, recordDuplicateReviewDecision, restoreRecordId, undoClientMerge, workspaceStatesEqual } from './workspace.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Una cuenta nueva arranca 100% vacía a propósito - clientes, tareas y
// unidades de negocio incluidas. Nada se auto-completa con datos de otra
// cuenta; cada usuario carga lo suyo desde cero (ver unitsMapFrom en
// sales-model.mjs para cómo se resuelve un businessUnits vacío).
const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], sales: [], dismissedInboxEventIds: [], ignoredWhatsAppContacts: [], deletedRecordIds: {}, boardLists: [], boardCards: [], salesGoals: [], planChecks: {}, commercialMasterVersion: '', historyResetVersion: '', tasksClosedThrough: '', primaryChannel: 'general', profileName: '', businessUnits: [], mergeLogs: [], duplicateReviewDecisions: [] };

function threadKey(event) {
  return whatsappContactKey(event);
}

export const onlineConfigured = Boolean(url && anonKey);
export const supabase = onlineConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Cada usuario tiene su propio espacio de trabajo (workspace_key = su user
// id): clientes, ventas, tareas y tablero quedan aislados por persona. La
// tabla whatsapp_events sigue siendo una sola para toda la empresa (hoy hay
// varios números de Meta conectados, cada uno con su dueño), así que acá
// filtramos por los canales que le pertenecen a quien está pidiendo el
// estado (allowedChannels) - Juan nunca debe recibir eventos de General o
// Penosil, ni viceversa.
export async function loadOnlineState(userId, allowedChannels = ['general']) {
  const [{ data: stateRow, error: stateError }, { data: events, error: eventsError }, { data: statusEvents, error: statusError }] = await Promise.all([
    supabase.from('workspace_states').select('data,updated_at,updated_by_email').eq('workspace_key', userId).maybeSingle(),
    // La bandeja comercial nace de consultas entrantes. Los mensajes enviados
    // por el equipo no crean alertas ni conversaciones por sí solos. Los
    // "preview" del puente de WhatsApp Web (canales sin API oficial, como
    // Penosil hoy) también son consultas reales y quedan adentro; lo único
    // que se pone en cuarentena de verdad es isLegacyWhatsAppPreview
    // (capturas de versiones viejas del puente, que sí podían confundir
    // canales/nombres).
    supabase.from('whatsapp_events').select('*').eq('direction', 'inbound').in('channel', allowedChannels).order('occurred_at', { ascending: false }).limit(500),
    // Cuando alguien contesta desde el teléfono (no desde el CRM), Meta no
    // manda el mensaje saliente, pero sí manda confirmaciones de status
    // (sent/delivered/read/played) para lo que se le mandó al cliente. Eso
    // alcanza para detectar "esto ya se respondió afuera" sin inventar nada.
    supabase.from('whatsapp_events').select('customer_wa_id,occurred_at').eq('direction', 'status').in('channel', allowedChannels).gte('occurred_at', new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()).limit(2000),
  ]);
  if (stateError) throw stateError;
  if (eventsError) throw eventsError;
  if (statusError) throw statusError;
  const state = stateRow?.data || null;
  const savedEvents = new Map((state?.inbox || []).map((item) => [item.event_id, item]));
  const ignored = new Map((state?.ignoredWhatsAppContacts || []).map((item) => [item.contactIdentity || whatsappContactIdentity({ customer_wa_id: item.customerWaId, customer_name: item.customerName }), item]));
  const inbox = filterDismissedEvents(events || [], state?.dismissedInboxEventIds || []).map((event) => {
    const rule = ignored.get(whatsappContactIdentity(event));
    return {
      ...event,
      ...(savedEvents.get(event.event_id) || {}),
      ...(rule ? { classification_status: 'excluded', excludedCategory: rule.category } : {}),
      legacyCapture: isLegacyWhatsAppPreview(event),
    };
  });
  return {
    state: state ? { ...EMPTY_STATE, ...state, inbox } : { ...EMPTY_STATE, inbox },
    updatedAt: stateRow?.updated_at,
    updatedBy: stateRow?.updated_by_email,
    statusEvents: statusEvents || [],
  };
}

export async function saveOnlineState(userId, email, data) {
  const { error } = await supabase.from('workspace_states').upsert({
    workspace_key: userId,
    data,
    updated_by: userId,
    updated_by_email: email,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
