import { useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Botón "Crear como borrador en Shopify" (24/10): antes de escribir revisa que la app tenga el permiso write_products, pide
// confirmación, manda de a 5 productos y muestra qué pasó con cada uno. Solo crea borradores: nada se publica ni se cambia.
async function call(body, session) {
  const response = await adminFetch({ action: "shopify", ...body }, session?.access_token);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(json.error || `Error ${response.status}`); error.code = json.code; throw error; }
  return json;
}

export const PERMISSION_HELP = [
  "Entrá a dev.shopify.com → tu app «Poliplast Datos» → Versiones → «Crear versión».",
  "En «Access scopes» agregá write_products (y write_inventory si querés que el stock 999 se cargue solo). Dejá los de lectura que ya tiene.",
  "Tocá «Release» y, en la tienda, Configuración → Apps → Poliplast Datos → aceptá los permisos nuevos.",
  "Volvé acá y probá de nuevo: no hace falta cambiar nada en Vercel.",
];

export function DraftButton({ session, build, label, className = "ghost", confirmText }) {
  const [state, setState] = useState({ phase: "idle", results: [], error: "", help: false });
  const run = async () => {
    const specs = build();
    if (!specs.length) { setState({ phase: "idle", results: [], error: "No hay nada para crear con este filtro.", help: false }); return; }
    setState({ phase: "checking", results: [], error: "", help: false });
    try {
      const scopes = await call({ op: "scopes" }, session);
      if (!scopes.canWrite) { setState({ phase: "idle", results: [], error: "La app de Shopify todavía no tiene permiso para crear productos.", help: true }); return; }
      const text = confirmText ? confirmText(specs.length, scopes) : `Se van a crear ${specs.length} producto(s) como BORRADOR en Shopify. No se publica nada ni se toca lo que ya existe. ¿Seguimos?`;
      if (typeof window !== "undefined" && window.confirm && !window.confirm(text)) { setState({ phase: "idle", results: [], error: "", help: false }); return; }
      const results = [];
      for (let index = 0; index < specs.length; index += 5) {
        setState({ phase: "running", results: [...results], error: "", help: false, done: index, total: specs.length });
        const batch = await call({ op: "create-drafts", products: specs.slice(index, index + 5) }, session);
        results.push(...(batch.results || []));
      }
      setState({ phase: "done", results, error: "", help: false });
    } catch (error) {
      setState({ phase: "idle", results: [], error: error.message, help: error.code === "sin_permiso" });
    }
  };
  const busy = state.phase === "checking" || state.phase === "running";
  const created = state.results.filter((result) => result.ok).length;
  return (
    <div className="draft-box">
      <button type="button" className={className} disabled={busy} onClick={run}>
        {state.phase === "checking" ? "Revisando permisos…" : state.phase === "running" ? `Creando… (${state.done || 0}/${state.total})` : label}
      </button>
      {state.error && <p className="system-message" role="alert">{state.error}</p>}
      {state.help && (
        <ol className="draft-help small">{PERMISSION_HELP.map((step) => <li key={step}>{step}</li>)}</ol>
      )}
      {state.phase === "done" && (
        <div className="small" role="status">
          <p><strong>{created} de {state.results.length} creados como borrador.</strong> Mirá Shopify → Productos → filtrá por «Borrador» para revisarlos y publicarlos vos.</p>
          <ul className="draft-results">
            {state.results.map((result, index) => <li key={index} className={result.ok ? "ok" : "bad"}>{result.ok ? "✓" : "✗"} {result.title}{result.ok ? "" : ` — ${result.error}`}</li>)}
          </ul>
          {state.results.find((result) => result.ok)?.stock && <p className="muted">{state.results.find((result) => result.ok).stock}</p>}
        </div>
      )}
    </div>
  );
}
