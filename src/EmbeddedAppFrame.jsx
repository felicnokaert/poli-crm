import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

// Otra aplicación del grupo (cotizador, entregas) mostrada como pestaña del CRM, con la misma sesión.
// Contrato: la aplicación de adentro avisa `{ tipo: readyType }` cuando está lista y el CRM le contesta
// `{ tipo: "crm:sesion", access_token, refresh_token }` solo a su origen; se lo reenvía cada vez que renueva.
// Cuidado con la sesión: adentro del CRM la otra aplicación NO renueva el token por su cuenta (si las dos lo
// renovaran, una invalidaría a la otra y el CRM se desloguearía). Lo renueva el CRM y se lo reenvía.
// bare: sin barra ni marco, ocupa la pantalla como cualquier otra sección del CRM (Entregas, 12/11, Felipe:
// "que sea parte del CRM, no una pestaña aparte").
export function EmbeddedAppFrame({ session, src, origin, readyType, openUrl, title, allow, bare = false }) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.tipo === readyType) setReady(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, readyType]);

  useEffect(() => {
    if (!ready || !session?.access_token) return;
    frameRef.current?.contentWindow?.postMessage(
      { tipo: "crm:sesion", access_token: session.access_token, refresh_token: session.refresh_token },
      origin,
    );
  }, [ready, origin, session?.access_token, session?.refresh_token]);

  useEffect(() => setReady(false), [src]);

  if (bare) {
    return <iframe ref={frameRef} key={src} className="embedded-app" src={src} title={title} allow={allow} />;
  }

  return (
    <div className="cotizador-frame-wrap">
      <div className="cotizador-frame-bar">
        <a className="secondary" href={openUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir en otra pestaña</a>
      </div>
      <iframe ref={frameRef} key={src} className="cotizador-frame" src={src} title={title} allow={allow} />
    </div>
  );
}
