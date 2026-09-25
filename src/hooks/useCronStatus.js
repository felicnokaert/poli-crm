import { useEffect, useState } from "react";
import { loadCronStatus } from "../online";

const REFRESH_MS = 30 * 60 * 1000;

// undefined = todavia no se sabe (cargando, o modo local sin Supabase: no hay
// cron que vigilar); null = no hay ninguna corrida registrada; objeto =
// { lastRunAt, ok } de la ultima corrida. Se refresca cada 30 minutos para
// que una pestaña abierta todo el dia no muestre un estado viejo.
export function useCronStatus(session) {
  const [status, setStatus] = useState(undefined);
  useEffect(() => {
    if (!session) {
      setStatus(undefined);
      return undefined;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const next = await loadCronStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(undefined);
      }
    }
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.user?.id]);
  return status;
}
