import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Entrenamiento intensivo (21/11, Felipe: «que labure a full hasta el 25 sin que yo tenga que revisar»). Un interruptor: el servidor
// aprende solo cada ~90 minutos (respuestas del equipo en Mercado Libre y fichas técnicas) y guarda lo aprendido marcado
// «aprendido solo». Se puede apagar o deshacer todo de una vez.
const COUNT_LABELS = [["repetidas", "respuestas repetidas del equipo"], ["juntadas", "temas juntados por la IA"], ["de-fichas", "respuestas sacadas de fichas"], ["fichas", "fichas leídas"], ["conflictos", "temas con respuestas que se contradicen (no se guardaron)"], ["insuficientes", "temas sin datos suficientes (no se guardaron)"], ["errores", "errores"]];
const usd = (value) => `US$ ${Number(value || 0).toFixed(2)}`;

export function IntensiveTraining({ supabase }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function call(body) {
    const { data } = await supabase.auth.getSession();
    const response = await adminFetch({ action: "training", ...body }, data?.session?.access_token || "");
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || `El servidor respondió ${response.status}.`);
    return json;
  }
  async function run(label, body) {
    setBusy(label); setError("");
    try { setState(await call(body)); } catch (failure) { setError(failure.message); }
    setBusy("");
  }
  useEffect(() => { if (supabase?.auth) run("load", { op: "status" }); }, [supabase]);

  if (!state) return <section className="panel"><h3>Entrenamiento intensivo</h3><p className="muted small">{error || "Cargando…"}</p></section>;
  const counts = state.counts || {};
  return (
    <section className="panel" aria-label="Entrenamiento intensivo">
      <h3>Entrenamiento intensivo (hasta el {state.until?.split("-").reverse().slice(0, 2).join("/")})</h3>
      <p className="muted small">Prendido, el CRM aprende solo cada hora y media, aunque nadie lo mire: junta las respuestas que el equipo ya dio en Mercado Libre y lee las fichas técnicas de Base técnica. Usa SOLO esos datos (no inventa) y lo que se contradice no lo guarda. Lo aprendido queda marcado como «aprendido solo, sin revisar», separado de lo que enseñaste vos.</p>
      <div className="assistant-teach-actions">
        <label className="check-row"><input type="checkbox" checked={Boolean(state.enabled)} disabled={Boolean(busy)} onChange={(event) => run("set", { op: "set", enabled: event.target.checked, dailyBudget: state.dailyBudget })} /> <strong>{state.enabled ? "Prendido" : "Apagado"}</strong></label>
        <label className="small">Tope por día: <select value={state.dailyBudget} disabled={Boolean(busy)} onChange={(event) => run("set", { op: "set", enabled: state.enabled, dailyBudget: Number(event.target.value) })}>{[5, 10, 20, 30].map((value) => <option key={value} value={value}>{usd(value)}</option>)}</select></label>
        <button type="button" className="secondary" disabled={Boolean(busy) || !state.enabled} onClick={() => run("run", { op: "run" })}>{busy === "run" ? "Aprendiendo… (hasta 1 minuto)" : "Aprender una tanda ahora"}</button>
      </div>
      <p className="small">Aprendió <strong>{state.learned ?? "—"}</strong> respuestas · gastó hoy <strong>{usd(state.spentToday)}</strong> de {usd(state.dailyBudget)} · en total {usd(state.spentTotal)}{state.finished ? " · ya leyó todo lo disponible" : ""}</p>
      <ul className="small muted">{COUNT_LABELS.filter(([key]) => counts[key]).map(([key, label]) => <li key={key}>{counts[key]} {label}</li>)}</ul>
      {state.lastError && <p className="small muted">Último error: {state.lastError}</p>}
      {error && <p className="small" role="alert" style={{ color: "var(--color-red, #b91c1c)" }}>{error}</p>}
      <button type="button" className="danger-link" disabled={Boolean(busy) || !state.learned} onClick={() => { if (window.confirm(`¿Borrar las ${state.learned} respuestas que aprendió solo y apagarlo? Lo que enseñaste vos no se toca.`)) run("undo", { op: "undo" }); }}>Deshacer todo lo que aprendió solo</button>
    </section>
  );
}
