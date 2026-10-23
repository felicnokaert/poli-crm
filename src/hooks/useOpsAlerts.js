import { useEffect, useState } from 'react';

// Alertas abiertas del CRM (crm_alerts) para el asistente. null = todavía no se pidieron o no llegaron.
export function useOpsAlerts(supabase) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!supabase?.from) return undefined;
    let alive = true;
    Promise.resolve(supabase.from('crm_alerts').select('*').is('resolved_at', null))
      .then(({ data, error }) => { if (alive) setRows(error ? [] : data || []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [supabase]);
  return rows;
}
