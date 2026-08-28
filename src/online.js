import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const onlineConfigured = Boolean(url && anonKey);
export const supabase = onlineConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function loadOnlineState(userId) {
  const [{ data: stateRow, error: stateError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('copilot_states').select('data,updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('whatsapp_events').select('*').neq('direction', 'status').order('occurred_at', { ascending: false }).limit(500),
  ]);
  if (stateError) throw stateError;
  if (eventsError) throw eventsError;
  const state = stateRow?.data || null;
  const savedEvents = new Map((state?.inbox || []).map((item) => [item.event_id, item]));
  const inbox = (events || []).map((event) => ({ ...event, ...(savedEvents.get(event.event_id) || {}) }));
  return { state: state ? { ...state, inbox } : { clients: [], interactions: [], tasks: [], inbox }, updatedAt: stateRow?.updated_at };
}

export async function saveOnlineState(userId, data) {
  const { error } = await supabase.from('copilot_states').upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

