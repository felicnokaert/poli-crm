import { createClient } from '@supabase/supabase-js';
import { isTrustedWhatsAppEvent } from './whatsapp-events.mjs';
export { mergeWorkspaceState, workspaceStatesEqual } from './workspace.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const WORKSPACE_KEY = 'grupo-poliplast';
const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [] };

export const onlineConfigured = Boolean(url && anonKey);
export const supabase = onlineConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function loadOnlineState() {
  const [{ data: stateRow, error: stateError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('workspace_states').select('data,updated_at,updated_by_email').eq('workspace_key', WORKSPACE_KEY).maybeSingle(),
    supabase.from('whatsapp_events').select('*').neq('direction', 'status').order('occurred_at', { ascending: false }).limit(500),
  ]);
  if (stateError) throw stateError;
  if (eventsError) throw eventsError;
  const state = stateRow?.data || null;
  const savedEvents = new Map((state?.inbox || []).filter(isTrustedWhatsAppEvent).map((item) => [item.event_id, item]));
  const inbox = (events || []).filter(isTrustedWhatsAppEvent).map((event) => ({ ...event, ...(savedEvents.get(event.event_id) || {}) }));
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
