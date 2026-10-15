import { useEffect, useState } from "react";
import { loadWhatsAppHealth } from "../online";

// undefined = no se sabe (cargando o modo local); null = el cron todavía no lo registró; objeto = último chequeo.
export function useWhatsAppHealth(session) {
  const [health, setHealth] = useState(undefined);
  useEffect(() => {
    if (!session) { setHealth(undefined); return undefined; }
    let cancelled = false;
    loadWhatsAppHealth().then((next) => { if (!cancelled) setHealth(next); }).catch(() => { if (!cancelled) setHealth(undefined); });
    return () => { cancelled = true; };
  }, [session?.user?.id]);
  return health;
}
