// Acceso a las tablas de la Bandeja del equipo (Supabase). Todo con RLS: cualquiera del equipo
// lee y asigna; solo el administrador edita el roster y las reglas.
// Ventana de 14 días: con ~70 mensajes por día el tope de 1000 filas por consulta alcanza justo.
export function makeTeamApi(supabase) {
  if (!supabase) return null;
  const unwrap = ({ data, error }) => { if (error) throw error; return data || []; };
  return {
    async load() {
      const [members, rules, assignments, events, statusEvents] = await Promise.all([
        supabase.from('team_members').select('*').order('created_at'),
        supabase.from('routing_rules').select('*').order('created_at'),
        supabase.from('conversation_assignments').select('*'),
        supabase.from('whatsapp_events').select('event_id,channel,direction,customer_wa_id,customer_name,text_body,occurred_at').eq('direction', 'inbound').gte('occurred_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('occurred_at', { ascending: false }).limit(1000),
        supabase.from('whatsapp_events').select('channel,customer_wa_id,occurred_at').eq('direction', 'status').gte('occurred_at', new Date(Date.now() - 14 * 86400000).toISOString()).limit(1000),
      ]);
      return { members: unwrap(members), rules: unwrap(rules), assignments: unwrap(assignments), events: unwrap(events), statusEvents: unwrap(statusEvents) };
    },
    async assign(conv, patch, by) {
      const row = { conversation_key: conv.key, channel: conv.channel, customer_wa_id: conv.customerWaId, customer_name: conv.customerName || '', updated_by: by || '', updated_at: new Date().toISOString(), ...patch };
      const { error } = await supabase.from('conversation_assignments').upsert(row, { onConflict: 'conversation_key' });
      if (error) throw error;
    },
    async addMember(member) { unwrap(await supabase.from('team_members').insert(member).select()); },
    async updateMember(id, patch) { unwrap(await supabase.from('team_members').update(patch).eq('id', id).select()); },
    async addRule(rule) { unwrap(await supabase.from('routing_rules').insert(rule).select()); },
    async removeRule(id) { const { error } = await supabase.from('routing_rules').delete().eq('id', id); if (error) throw error; },
  };
}
