import { createClient } from '@supabase/supabase-js';
import { filterDismissedEvents, isLegacyWhatsAppPreview } from './whatsapp-events.mjs';
import { whatsappContactKey } from './whatsapp-threads.mjs';
export { mergeWorkspaceState, workspaceStatesEqual } from './workspace.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const WORKSPACE_KEY = 'grupo-poliplast';
const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], dismissedInboxEventIds: [], ignoredWhatsAppContacts: [], planChecks: {}, commercialMasterVersion: '' };

function threadKey(event) {
  return whatsappContactKey(event);
}

export const onlineConfigured = Boolean(url && anonKey);
export const supabase = onlineConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function loadOnlineState() {
  const [{ data: stateRow, error: stateError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('workspace_states').select('data,updated_at,updated_by_email').eq('workspace_key', WORKSPACE_KEY).maybeSingle(),
    // La bandeja comercial nace de consultas entrantes. Los mensajes enviados
    // por el equipo no crean alertas ni conversaciones por sí solos.
    supabase.from('whatsapp_events').select('*').eq('direction', 'inbound').order('occurred_at', { ascending: false }).limit(500),
  ]);
  if (stateError) throw stateError;
  if (eventsError) throw eventsError;
  const state = stateRow?.data || null;
  const savedEvents = new Map((state?.inbox || []).map((item) => [item.event_id, item]));
  const ignored = new Map((state?.ignoredWhatsAppContacts || []).map((item) => [item.key, item]));
  const inbox = filterDismissedEvents(events || [], state?.dismissedInboxEventIds || []).map((event) => {
    const rule = ignored.get(threadKey(event));
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
  };
}

export async function saveOnlineState(userId, email, data) {
  const { error } = await supabase.from('workspace_states').upsert({
    workspace_key: WORKSPACE_KEY,
    data,
    updated_by: userId,
    updated_by_email: email,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
