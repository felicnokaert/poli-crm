import { useEffect, useRef, useState } from "react";
import { onlineConfigured } from "../online";

const EMPTY_ARRAY = [];

// Empresas que muestra el mapa: las propias, o (Juan y David) las de Felipe que entrega el servidor.
// Salió de App.jsx sin cambios de comportamiento (QA 16/10).
export function useRapypClients({ session, seesRapyp, isFelipeTools, clients }) {
  // Juan y David ven el mapa RAPYP con las empresas de Felipe (las completas: ubicaciones, compras y
  // tipo), que entrega el servidor solo a ellos (lib/rapyp-clients.mjs). Felipe usa las suyas.
  // Para que abra rápido: se baja en segundo plano apenas entran (no al abrir el mapa) y queda una copia
  // en este navegador, que se muestra al instante la próxima vez mientras llega la versión nueva.
  const [rapypClients, setRapypClients] = useState(null);
  const usesFelipeMapData = seesRapyp && !isFelipeTools && onlineConfigured;
  const rapypFetchedRef = useRef(false);
  const rapypCacheKey = session?.user?.id ? `poliplast-rapyp-cache:${session.user.id}` : "";
  useEffect(() => {
    if (!usesFelipeMapData || !rapypCacheKey) return;
    try {
      const cached = JSON.parse(localStorage.getItem(rapypCacheKey) || "null");
      if (Array.isArray(cached)) setRapypClients((current) => current || cached);
    } catch { /* sin copia: se espera la del servidor */ }
  }, [usesFelipeMapData, rapypCacheKey]);
  useEffect(() => {
    if (!usesFelipeMapData || !session?.access_token || rapypFetchedRef.current) return undefined;
    const timer = setTimeout(() => {
      rapypFetchedRef.current = true;
      fetch("/api/mapa-publico?rapyp=1", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!body) { rapypFetchedRef.current = false; return; }
          setRapypClients(body.clients || []);
          try { localStorage.setItem(rapypCacheKey, JSON.stringify(body.clients || [])); } catch { /* sin lugar: igual funciona */ }
        })
        .catch(() => { rapypFetchedRef.current = false; });
    }, 1500);
    return () => clearTimeout(timer);
  }, [usesFelipeMapData, session?.access_token, rapypCacheKey]);
  return usesFelipeMapData ? rapypClients || EMPTY_ARRAY : clients;
}
