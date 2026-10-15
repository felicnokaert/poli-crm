// Pedidos de investigación a Claude (tabla prospect_requests). La app deja el pedido;
// una sesión de Claude lo investiga en la web y completa result_markdown.
export const REMOTE_STATUS = {
  pendiente: 'Pedida: esperando a Claude',
  en_curso: 'Claude está investigando',
  lista: 'Resultado listo',
  error: 'Falló la investigación',
};

export function remoteLabel(row) {
  const base = REMOTE_STATUS[row?.status] || 'Pedida';
  return row?.progress && row.status === 'en_curso' ? `${base}: ${row.progress}` : base;
}

export function makeRequestsApi(supabase) {
  if (!supabase) return null;
  return {
    async create(job, email) {
      const { error } = await supabase.from('prospect_requests').insert({
        id: job.id, user_email: String(email || '').trim().toLowerCase(), family: job.family, scope: job.scope, wanted: job.count, notes: job.notes || '', prompt: job.prompt,
      });
      if (error) throw error;
    },
    async fetch(ids) {
      if (!ids.length) return [];
      const { data, error } = await supabase.from('prospect_requests').select('id,status,progress,result_markdown,result_count').in('id', ids);
      if (error) throw error;
      return data || [];
    },
  };
}
