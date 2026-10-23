import { useEffect, useMemo, useState } from 'react';
import { deniedSet } from './../module-access.mjs';

// Lo que se le quitó a esta cuenta (tabla module_access). Sin la tabla o sin conexión, ve todo como siempre.
export function useModuleAccess(supabase, email, enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled || !supabase || !email) { setRows([]); return undefined; }
    let alive = true;
    supabase.from('module_access').select('module, allowed').eq('email', String(email).toLowerCase()).then(({ data, error }) => {
      if (alive) setRows(error ? [] : data || []);
    });
    return () => { alive = false; };
  }, [supabase, email, enabled]);
  return useMemo(() => deniedSet(rows), [rows]);
}
