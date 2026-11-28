import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Poliplast App (26/11): «Algo no anda». Se abre desde la barra de arriba (⚠). Manda qué pasó, en qué pantalla y
// qué tan grave; la pantalla, el ancho y el navegador van solos. Sin base (prueba con datos inventados) queda
// guardado en este navegador.
const SEVERITIES = [["no-me-deja", "No me deja trabajar"], ["molesta", "Molesta, pero sigo"], ["idea", "Idea o sugerencia"]];
const LOCAL_KEY = "poliplast-app-reports-local";

export function ReportProblem({ open, onClose, view, viewLabel, name = "", online = false }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState("molesta");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setState("idle"); setError(""); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const send = async (event) => {
    event.preventDefault();
    if (text.trim().length < 3) { setError("Contanos qué pasó (aunque sea una línea)."); return; }
    setState("sending");
    const payload = { action: "app-report", op: "send", text, severity, view, viewLabel, name, width: window.innerWidth, agent: navigator.userAgent, version: "poliplast-app" };
    try {
      if (!online) {
        const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
        localStorage.setItem(LOCAL_KEY, JSON.stringify([{ ...payload, at: new Date().toISOString(), status: "nuevo", id: `local-${Date.now()}` }, ...saved].slice(0, 100)));
      } else {
        const response = await adminFetch(payload);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `código ${response.status}`);
      }
      setState("sent");
      setText("");
    } catch (failure) {
      setState("idle");
      setError(`No se pudo mandar: ${failure.message}. Probá de nuevo.`);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()}>
        {state === "sent" ? (
          <div className="report-sent">
            <h2 id="report-title">¡Gracias!</h2>
            <p>Lo recibió Felipe y lo vamos a revisar. Si es urgente, avisale también por WhatsApp.</p>
            <button type="button" className="primary" onClick={onClose}>Listo</button>
          </div>
        ) : (
          <form onSubmit={send} className="report-form">
            <h2 id="report-title">Algo no anda</h2>
            <p className="muted small">Estás en <b>{viewLabel || view}</b>. Contanos qué hiciste y qué pasó (o qué te gustaría).</p>
            <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ej.: toqué «Copiar para WhatsApp» y no copió nada." autoFocus />
            <div className="report-severity" role="radiogroup" aria-label="¿Qué tan grave?">
              {SEVERITIES.map(([id, label]) => (
                <label key={id} className={severity === id ? "selected" : ""}><input type="radio" name="severity" value={id} checked={severity === id} onChange={() => setSeverity(id)} /> {label}</label>
              ))}
            </div>
            {error && <p className="quote-warn small" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="primary" disabled={state === "sending"}>{state === "sending" ? "Mandando…" : "Mandar"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Para administradores: Configuración → Avisos del equipo.
export function AppReports({ online = false }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("nuevo");
  const [error, setError] = useState("");
  const load = async () => {
    try {
      if (!online) { setItems(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]")); return; }
      const response = await adminFetch({ action: "app-report", op: "list" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || response.status);
      setItems(body.items || []);
    } catch (failure) { setError(String(failure.message || failure)); setItems([]); }
  };
  useEffect(() => { load(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = async (item, status) => {
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status } : row)));
    if (!online) { localStorage.setItem(LOCAL_KEY, JSON.stringify(items.map((row) => (row.id === item.id ? { ...row, status } : row)))); return; }
    await adminFetch({ action: "app-report", op: "resolve", id: item.id, status }).catch(() => {});
  };
  const shown = (items || []).filter((item) => filter === "todos" || item.status === filter);
  const label = Object.fromEntries(SEVERITIES);
  return (
    <section className="panel app-reports">
      <span className="eyebrow">Solo administradores</span>
      <h2>Avisos del equipo («Algo no anda»)</h2>
      <div className="segmented demo-tabs" role="tablist" aria-label="Filtro">
        {[["nuevo", "Nuevos"], ["resuelto", "Resueltos"], ["todos", "Todos"]].map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{text} ({(items || []).filter((item) => id === "todos" || item.status === id).length})</button>
        ))}
      </div>
      {error && <p className="quote-warn small">{error}</p>}
      {items === null ? <p className="muted">Cargando…</p> : shown.length === 0 ? <p className="muted">No hay avisos {filter === "nuevo" ? "nuevos" : ""}. 👍</p> : (
        <ul className="app-reports-list">
          {shown.map((item) => (
            <li key={item.id} className={`sev-${item.severity}`}>
              <div className="app-reports-head">
                <strong>{label[item.severity] || item.severity}</strong>
                <span className="muted small">{String(item.at || "").slice(0, 16).replace("T", " ")} · {item.name || item.by || "sin nombre"} · {item.viewLabel || item.view}{item.width ? ` · ${item.width < 760 ? "celular" : "compu"}` : ""}</span>
              </div>
              <p>{item.text}</p>
              <button type="button" className="secondary" onClick={() => resolve(item, item.status === "resuelto" ? "nuevo" : "resuelto")}>{item.status === "resuelto" ? "Volver a abrir" : "Marcar resuelto"}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
