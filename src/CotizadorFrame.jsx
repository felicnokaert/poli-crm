import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { COTIZADOR_ORIGIN, cotizadorUrl } from "./app-shared";

// El cotizador como pestaña del CRM. Sigue siendo su propia aplicación (repo poliplast-cotizador, misma
// base); acá se muestra adentro y se le pasa la sesión para no tener que entrar de nuevo.
// Cuidado con la sesión: dentro del CRM el cotizador NO renueva el token por su cuenta (si los dos lo
// renovaran, uno invalidaría al otro y el CRM se desloguearía). Lo renueva el CRM y se lo reenvía.
export function CotizadorFrame({ session, client }) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const src = cotizadorUrl(client?.company || "", client?.phone || "", { embed: true });

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== COTIZADOR_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.tipo === "cotizador:listo") setReady(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !session?.access_token) return;
    frameRef.current?.contentWindow?.postMessage(
      { tipo: "crm:sesion", access_token: session.access_token, refresh_token: session.refresh_token },
      COTIZADOR_ORIGIN,
    );
  }, [ready, session?.access_token, session?.refresh_token]);

  useEffect(() => setReady(false), [src]);

  return (
    <div className="cotizador-frame-wrap">
      <div className="cotizador-frame-bar">
        <a className="secondary" href={cotizadorUrl(client?.company || "", client?.phone || "")} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir en otra pestaña</a>
      </div>
      <iframe ref={frameRef} key={src} className="cotizador-frame" src={src} title="Cotizador comercial" allow="clipboard-write" />
    </div>
  );
}
