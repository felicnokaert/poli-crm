import { useEffect, useRef, useState } from "react";
import { SUBMODULES } from "./poliplast-app-plan.mjs";
import { accessAllows } from "./team-access.mjs";
import { resolvedTheme, visibleSlice } from "./embedded-frame-view.mjs";

// Poliplast App (25-26/11): muestra otra app del grupo (Entregas, la app de conteo) adentro de la app, desde el
// MISMO link (mismo origen), para que se sienta una pantalla más y no una pestaña aparte:
// - sin marco; si la app de adentro avisa su alto ({ tipo: 'entregas:alto' | 'conteo:alto', alto }), el iframe toma
//   ese alto y se desplaza con la página (sin barra propia), y se le cuenta qué parte se ve ({ tipo: 'crm:vista' }).
// - le pasa el tema claro/oscuro ({ tipo: 'crm:tema' }) y { tipo: 'app:subir' } sube la página.
const HEIGHT_TYPES = new Set(["entregas:alto", "conteo:alto", "app:alto"]);

export function MaquetaFrame({ src, title, children = null, theme = null }) {
  // La app de conteo hoy es solo clara: se le manda siempre claro (si no, el navegador pinta un fondo opaco).
  const frameRef = useRef(null);
  const [height, setHeight] = useState(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "*";

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data || {};
      if (HEIGHT_TYPES.has(data.tipo) && Number(data.alto) > 0) setHeight(Math.ceil(Number(data.alto)));
      if (data.tipo === "app:subir") window.scrollTo({ top: 0, behavior: "smooth" });
      if (typeof data.tipo === "string" && /:(listo|lista)$/.test(data.tipo)) frameRef.current?.contentWindow?.postMessage({ tipo: "crm:tema", tema: (theme || resolvedTheme()) }, origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  useEffect(() => {
    if (height == null) return undefined;
    let frame = 0;
    let last = "";
    const send = () => {
      frame = 0;
      const el = frameRef.current;
      if (!el?.contentWindow) return;
      const bar = document.querySelector(".mobile-tabbar");
      const slice = visibleSlice({ rect: el.getBoundingClientRect(), viewportHeight: window.innerHeight, viewportWidth: window.innerWidth, bottomBar: bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect() : null });
      const key = `${slice.top}|${slice.alto}`;
      if (key === last) return;
      last = key;
      el.contentWindow.postMessage({ tipo: "crm:vista", ...slice }, origin);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(send); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => { if (frame) cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule, { capture: true }); window.removeEventListener("resize", schedule); };
  }, [height, origin]);

  useEffect(() => {
    const sendTheme = () => frameRef.current?.contentWindow?.postMessage({ tipo: "crm:tema", tema: (theme || resolvedTheme()) }, origin);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(sendTheme) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer?.disconnect();
  }, [origin]);

  const [path, hash = ""] = String(src).split("#");
  const withTema = `${path}${path.includes("?") ? "&" : "?"}tema=${(theme || resolvedTheme())}${hash ? `#${hash}` : ""}`;
  return (
    <section className={`maqueta-frame${height != null ? " is-auto" : ""}`}>
      {children}
      <iframe ref={frameRef} src={withTema} title={title} loading="eager" style={height != null ? { height } : undefined} onLoad={() => frameRef.current?.contentWindow?.postMessage({ tipo: "crm:tema", tema: (theme || resolvedTheme()) }, origin)} />
    </section>
  );
}

function SubTabs({ subs, value, onChange, label }) {
  if (subs.length < 2) return null;
  return (
    <div className="segmented demo-tabs" role="tablist" aria-label={label}>
      {subs.map((item) => <button key={item} type="button" role="tab" aria-selected={value === item} className={value === item ? "selected" : ""} onClick={() => onChange(item)}>{item}</button>)}
    </div>
  );
}

const useSub = (module, access) => {
  const subs = (SUBMODULES[module] || []).filter((sub) => !access || accessAllows(access, module, sub));
  const [picked, setPicked] = useState(subs[0] || "");
  return [subs, subs.includes(picked) ? picked : subs[0] || "", setPicked];
};

// App de conteo (otro repositorio): cada submódulo abre su pestaña directo por hash (#etiquetas/devoluciones).
export const CONTEO_MODULES = {
  etiquetas: { title: "Etiquetas", hash: (sub) => `etiquetas/${sub}`, lightOnly: true },
  conteo: { title: "Conteo", hash: (sub) => (sub === "admin" ? "conteo/admin" : "conteo"), lightOnly: true },
  dosificado: { title: "Dosificado", hash: (sub) => `dosificado/${sub}`, lightOnly: true },
};
const HASH_OF = { Escanear: "escanear", Pendientes: "pendientes", Hecho: "hecho", Devoluciones: "devoluciones", Cortes: "cortes", Cargar: "cargar", Kits: "kits", Registros: "registros", Resumen: "resumen", "Categorías": "", "Administración": "admin" };

export function ConteoMaqueta({ module, access = null, who = null, base = "/conteo-maqueta/" }) {
  const info = CONTEO_MODULES[module];
  const [subs, sub, setSub] = useSub(module, access);
  const params = new URLSearchParams({ embebida: "1", marco: "poliplast", persona: who?.who || "Marcos", deposito: who?.deposit || "Villa Domínico" });
  return (
    <MaquetaFrame src={`${base}?${params}#${info.hash(HASH_OF[sub] || "")}`} title={info.title} theme={info.lightOnly ? "light" : null}>
      <SubTabs subs={subs} value={sub} onChange={setSub} label={`Submódulos de ${info.title}`} />
    </MaquetaFrame>
  );
}

// Entregas: los submódulos del menú abren su pantalla por hash.
const ENTREGAS_HASH = { Pedidos: "#/pedidos", "Expedición hoy": "#/expedicion", Calendario: "#/calendario", "Tablero del depósito": "#/pantalla" };
export function EntregasEmbed({ base, access = null, who = null }) {
  const [subs, sub, setSub] = useSub("entregas", access);
  const params = new URLSearchParams({ embed: "app", marco: "poliplast", ...(who ? { persona: who.who, deposito: who.deposit } : {}) });
  return (
    <MaquetaFrame src={`${base}?${params}${ENTREGAS_HASH[sub] || ""}`} title="Entregas">
      <SubTabs subs={subs} value={sub} onChange={setSub} label="Submódulos de Entregas" />
    </MaquetaFrame>
  );
}
