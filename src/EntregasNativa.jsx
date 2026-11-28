// Entregas como módulo NATIVO de Poliplast App (28/11, Felipe: «no quiero que una app esté dentro de otra»).
// Mismo código que Poli-Entregas (carpeta entregas/), dibujado acá adentro con el cliente de Supabase y la sesión de la app:
// sin iframe, sin segundo login, sin mensajes de alto. Sus estilos se encierran debajo de `.ent-nativo` (scope-css.mjs).
import { useEffect, useMemo, useState } from "react";
import { EntregasNativa as Entregas, estilosEntregas, estilosTablero } from "../entregas/src/nativo.tsx";
import { scopeCss } from "./scope-css.mjs";
import { accessAllows, tabSubs } from "./team-access.mjs";

// Clases que Entregas ponía en <html>; acá van en el contenedor.
const ROOT_CLASSES = ["embebido", "marco-poliplast", "alto-auto", "en-app"];
const STYLE_ID = "entregas-nativa-estilos";
// Ajustes de convivencia: Entregas era la página entera (alto mínimo de pantalla, fondo propio).
const NATIVE_EXTRA = `
.ent-nativo.marco-poliplast { min-height: 0; background: transparent; }
.ent-nativo.ent-capa { min-height: 0; height: 0; }
@media (max-width: 760px) { .ent-nativo .bulk-bar { bottom: calc(76px + env(safe-area-inset-bottom)); } .ent-nativo .toasts { bottom: calc(80px + env(safe-area-inset-bottom)); } }
`;
const SUB_HASH = { Pedidos: "#/pedidos", "Expedición hoy": "#/expedicion", Calendario: "#/calendario", "Tablero del depósito": "#/pantalla" };
const subOfHash = (hash) => {
  if (/^#\/(pedidos|p\/|nuevo)/.test(hash)) return "Pedidos";
  if (hash.startsWith("#/expedicion")) return "Expedición hoy";
  if (hash.startsWith("#/calendario")) return "Calendario";
  if (hash.startsWith("#/pantalla")) return "Tablero del depósito";
  return "";
};

/** Estilos de Entregas encerrados, una sola vez por página. */
function useEntregasStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${scopeCss(`${estilosEntregas}\n${estilosTablero}`, { rootClasses: ROOT_CLASSES })}\n${NATIVE_EXTRA}`;
    document.head.appendChild(style);
  }, []);
}

export default function EntregasNativa({ supabase, access = null, readOnly = false, demoApi = null }) {
  useEntregasStyles();
  const subs = useMemo(() => tabSubs("entregas").filter((sub) => !access || accessAllows(access, "entregas", sub)), [access]);
  // Al entrar sin pantalla de Entregas en la dirección, abre la del submódulo (antes del primer dibujo: Entregas lee la dirección).
  const [sub, setSub] = useState(() => {
    const current = subOfHash(window.location.hash);
    if (current) return current;
    const first = subs[0] || "Pedidos";
    if (SUB_HASH[first]) window.history.replaceState(null, "", SUB_HASH[first]);
    return first;
  });
  useEffect(() => {
    const onHash = () => { const next = subOfHash(window.location.hash); if (next) setSub(next); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (next) => { setSub(next); window.location.hash = SUB_HASH[next] || ""; window.scrollTo({ top: 0 }); };
  if (!supabase && !demoApi) return <p className="muted">Entregas necesita la conexión en línea.</p>;
  return (
    <section className="entregas-nativa">
      {subs.length > 1 && (
        <div className="segmented demo-tabs" role="tablist" aria-label="Submódulos de Entregas">
          {subs.map((item) => <button key={item} type="button" role="tab" aria-selected={sub === item} className={sub === item ? "selected" : ""} onClick={() => pick(item)}>{item}</button>)}
        </div>
      )}
      <div className="ent-nativo embebido marco-poliplast">
        <Entregas cliente={supabase} soloLectura={readOnly} apiPrueba={demoApi || undefined} />
      </div>
    </section>
  );
}
