import { createClient } from '@supabase/supabase-js';
import { filterDismissedEvents, isLegacyWhatsAppPreview } from './whatsapp-events.mjs';
import { whatsappContactIdentity, whatsappContactKey } from './whatsapp-threads.mjs';
import { withRetry } from '../lib/retry.mjs';
export { completeTasksThrough, mergeClients, mergeWorkspaceState, recordDeletions, recordDuplicateReviewDecision, restoreRecordId, undoClientMerge, validateWorkspaceStateShape, workspaceStatesEqual } from './workspace.mjs';
import { mergeWorkspaceState, validateWorkspaceStateShape } from './workspace.mjs';
import { saveWithConcurrency } from './workspace-save.mjs';

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
  if (stateRow?.updated_at) knownVersions.set(userId, stateRow.updated_at);
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

// Ultima corrida del mantenimiento diario, leida de una tabla que solo escribe
// el servidor (ver supabase/migrations/20260925190000_add_crm_system_status.sql)
// - a diferencia de workspace_states.data, ningun guardado del navegador puede
// pisarla. Devuelve null si nunca se registro una corrida.
export async function loadCronStatus() {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('crm_system_status')
    .select('last_run_at,ok')
    .eq('key', 'daily-maintenance')
    .maybeSingle();
  if (error) throw error;
  return data ? { lastRunAt: data.last_run_at, ok: data.ok } : null;
}

// Cada guardado del CRM pasa por acá. Si Supabase devuelve un 5xx pasajero
// (o el PATCH ni siquiera llega a completarse por un corte de red), no tiene
// sentido perder los cambios del usuario a la primera - se reintenta un par
// de veces con backoff acotado. Un 401/403 (sesión vencida, RLS) nunca se
// reintenta: va a fallar exactamente igual y solo demoraría el error real.
//
// El guardado es con control de version (ver workspace-save.mjs): compara la
// updated_at que este navegador vio por ultima vez. Si el servidor (tasks-
// intake, cron) u otra pestaña escribieron mientras tanto, no pisa: une lo de
// afuera con lo local y devuelve { data, merged } para que la UI lo adopte.
const knownVersions = new Map();

// PostgREST devuelve el error sin el status HTTP adentro; lo sumamos para que
// withRetry pueda decidir si un fallo es reintentable.
function checked({ data, error, status }) {
  if (error) throw Object.assign(error, { httpStatus: status });
  return data;
}

export async function saveOnlineState(userId, email, data) {
  // Validación de forma antes de gastar un round-trip (y reintentos) contra
  // Supabase: si `data` está corrupto, no tiene sentido reintentarlo, va a
  // fallar la validación exactamente igual las tres veces.
  validateWorkspaceStateShape(data);
  const result = await withRetry(async () => {
    try {
      const saved = await saveWithConcurrency({
        data,
        version: knownVersions.get(userId),
        tryUpdate: async (next, version) => {
          const rows = checked(await supabase
            .from('workspace_states')
            .update({ data: next, updated_by: userId, updated_by_email: email, updated_at: new Date().toISOString() })
            .eq('workspace_key', userId)
            .eq('updated_at', version)
            .select('updated_at'));
          return rows?.length ? { ok: true, version: rows[0].updated_at } : { ok: false };
        },
        fetchRemote: async () => {
          const row = checked(await supabase.from('workspace_states').select('data,updated_at').eq('workspace_key', userId).maybeSingle());
          return row ? { data: row.data, version: row.updated_at } : null;
        },
        forceWrite: async (next) => {
          const rows = checked(await supabase
            .from('workspace_states')
            .upsert({ workspace_key: userId, data: next, updated_by: userId, updated_by_email: email, updated_at: new Date().toISOString() })
            .select('updated_at'));
          return { version: rows?.[0]?.updated_at };
        },
        merge: mergeWorkspaceState,
      });
      return { ok: true, saved };
    } catch (error) {
      // supabase-js puede rechazar la promesa directamente en cortes de red
      // (fetch failed) en vez de resolver con { error }: sin httpStatus.
      return { ok: false, status: error?.httpStatus, error, threw: error?.httpStatus === undefined };
    }
  });
  if (!result.ok) throw result.error;
  knownVersions.set(userId, result.saved.version);
  return { data: result.saved.data, merged: result.saved.merged };
}
