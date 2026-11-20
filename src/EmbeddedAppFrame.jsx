import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { visibleSlice } from "./embedded-frame-view.mjs";

// Otra aplicación del grupo (cotizador, entregas) mostrada como pestaña del CRM, con la misma sesión.
// Contrato: la aplicación de adentro avisa `{ tipo: readyType }` cuando está lista y el CRM le contesta
// `{ tipo: "crm:sesion", access_token, refresh_token }` solo a su origen; se lo reenvía cada vez que renueva.
// Cuidado con la sesión: adentro del CRM la otra aplicación NO renueva el token por su cuenta (si las dos lo
// renovaran, una invalidaría a la otra y el CRM se desloguearía). Lo renueva el CRM y se lo reenvía.
// bare: sin barra ni marco, ocupa la pantalla como cualquier otra sección del CRM (Entregas, 12/11, Felipe:
// "que sea parte del CRM, no una pestaña aparte").
// heightType (20/11, Felipe: «que no sea un recuadro con su propia barra»): si la app de adentro avisa
// `{ tipo: heightType, alto }`, el iframe toma ese alto y se desplaza con la página del CRM (sin barra propia).
// Como adentro ya no hay desplazamiento, el CRM le manda `{ tipo: "crm:vista", top, alto }` = la parte del
// iframe que se ve en pantalla, para que ubique ahí sus ventanas y avisos. `{ tipo: "app:subir" }` lleva la
// página al principio del iframe (al cambiar de pantalla adentro).
export function EmbeddedAppFrame({ session, src, origin, readyType, heightType, openUrl, title, allow, bare = false }) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sentRef = useRef("");
  function sendSession(current) {
    if (!current?.access_token) return;
    frameRef.current?.contentWindow?.postMessage(
      { tipo: "crm:sesion", access_token: current.access_token, refresh_token: current.refresh_token },
      origin,
    );
    sentRef.current = current.access_token;
  }

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const tipo = event.data?.tipo;
      if (tipo === readyType) {
        setReady(true);
        // Cada aviso de «lista» recibe la sesión: si la app de adentro se recargó sola, no se queda en «Cargando…».
        sendSession(sessionRef.current);
      }
      if (heightType && tipo === heightType) {
        const alto = Number(event.data.alto);
        if (Number.isFinite(alto) && alto > 0) setHeight(Math.min(Math.ceil(alto), 100000));
      }
      if (heightType && tipo === "app:subir") {
        const rect = frameRef.current?.getBoundingClientRect();
        if (rect && rect.top < 0) frameRef.current.scrollIntoView({ block: "start" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, readyType, heightType]);

  // Pasarle la sesión del CRM cuando la app de adentro avisa que está lista, y de nuevo cada vez que el CRM la renueva.
  // (20/11: este paso se había perdido y el cotizador y Entregas volvían a pedir usuario y contraseña.)
  useEffect(() => {
    if (!ready || !session?.access_token || sentRef.current === session.access_token) return;
    sendSession(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, origin, session?.access_token, session?.refresh_token]);

  // Con alto automático, contarle a la app de adentro qué parte suya se ve (al desplazar, al cambiar el tamaño).
  useEffect(() => {
    if (!heightType || height == null) return undefined;
    let frame = 0;
    let last = "";
    function send() {
      frame = 0;
      const el = frameRef.current;
      if (!el?.contentWindow) return;
      const bar = document.querySelector(".mobile-tabbar");
      const topBar = document.querySelector(".app-shell > .sidebar");
      const slice = visibleSlice({
        rect: el.getBoundingClientRect(),
        viewportHeight: window.innerHeight,
        bottomBar: bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect() : null,
        topBar: topBar && getComputedStyle(topBar).position === "sticky" ? topBar.getBoundingClientRect() : null,
        viewportWidth: window.innerWidth,
      });
      const key = `${slice.top}|${slice.alto}`;
      if (key === last) return;
      last = key;
      el.contentWindow.postMessage({ tipo: "crm:vista", ...slice }, origin);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(send); }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [heightType, height, origin]);

  useEffect(() => { setReady(false); setHeight(null); sentRef.current = ""; }, [src]);

  if (bare) {
    return (
      <iframe
        ref={frameRef}
        key={src}
        className={`embedded-app${height != null ? " auto-height" : ""}`}
        style={height != null ? { height } : undefined}
        scrolling={height != null ? "no" : undefined}
        src={src}
        title={title}
        allow={allow}
      />
    );
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
