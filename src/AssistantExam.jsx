import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Examen semanal del asistente (26/11): cada lunes el servidor le toma preguntas reales de Mercado Libre, un juez corrige y
// lo que falló (si el equipo ya lo respondió igual varias veces) queda aprendido. Acá se ve la evolución semana a semana.
const VERDICT = { correcta: "Bien", parcial: "A medias", incorrecta: "Mal", "sin-dato": "Sin dato" };
const date = (day) => day.split("-").reverse().slice(0, 2).join("/");

export function AssistantExam({ supabase }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function call(body) {
    const { data } = await supabase.auth.getSession();
    const response = await adminFetch({ action: "ai-exam", ...body }, data?.session?.access_token || "");
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || `El servidor respondió ${response.status}.`);
    return json;
  }
  useEffect(() => { if (supabase?.auth) call({ op: "status" }).then(setState).catch((error) => setMessage(error.message)); }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps
  async function runNow() {
    setBusy(true); setMessage("Tomando el examen (unos 40 segundos)…");
    try {
      const result = await call({ op: "run" });
      setState(result);
      const run = result.run || {};
      setMessage(run.ok ? `Listo: ${run.asked} preguntas, aprendió ${run.learned}, costo US$ ${Number(run.usd || 0).toFixed(2)}.` : `No corrió: ${run.reason || "sin detalle"}.`);
    } catch (error) { setMessage(error.message); }
    setBusy(false);
  }
  const weeks = state?.weeks || [];
  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const topics = last ? Object.entries(last.byIntent || {}).map(([label, entry]) => ({ label, ...entry, pct: Math.round((entry.correcta / entry.total) * 100) })).sort((a, b) => a.pct - b.pct) : [];
  return (
    <section className="panel assistant-exam">
      <div className="panel-head">
        <div><span className="eyebrow">Examen semanal</span><h3>Cómo viene aprendiendo el asistente</h3></div>
        <button type="button" className="secondary" disabled={busy} onClick={runNow}>{busy ? "Tomando examen…" : "Tomar examen ahora"}</button>
      </div>
      <p className="muted small">Cada lunes responde preguntas reales de Mercado Libre sin ver la respuesta del equipo y un juez lo corrige. Cuando se equivoca y el equipo ya respondió eso mismo varias veces, lo aprende solo (queda «sin revisar»; lo que enseñás vos siempre manda). Cuesta centavos.</p>
      {message && <p className="form-notice">{message}</p>}
      {!state ? <p className="muted small">Cargando…</p> : !last ? <p className="muted small">Todavía no hubo examen. El primero corre el lunes a las 9:05, o tocá «Tomar examen ahora».</p> : (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span>Respuestas bien</span><strong>{last.pct}%</strong>{prev && <small className="muted">{last.pct - prev.pct >= 0 ? "+" : ""}{last.pct - prev.pct} contra la semana anterior</small>}</article>
            <article className="metric-card"><span>Le sirven (bien + a medias)</span><strong>{last.useful}%</strong></article>
            <article className="metric-card"><span>Aprendió esta semana</span><strong>{last.learned}</strong></article>
            <article className="metric-card"><span>Preguntas</span><strong>{last.total}</strong><small className="muted">US$ {Number(last.usd || 0).toFixed(2)}</small></article>
          </div>
          {weeks.length > 1 && (
            <div className="exam-weeks" aria-label="Evolución por semana">
              {weeks.slice(-10).map((week) => (
                <div key={week.week} className="exam-week" title={`${week.pct}% bien`}>
                  <span className="exam-bar" style={{ height: `${Math.max(4, week.pct)}%` }} />
                  <small>{date(week.week)}</small>
                </div>
              ))}
            </div>
          )}
          {topics.length > 0 && <p className="small"><strong>Por tema (peor primero):</strong> {topics.map((topic) => `${topic.label} ${topic.pct}% (${topic.total})`).join(" · ")}</p>}
          <details>
            <summary className="small">Ver las preguntas de esta semana</summary>
            <ul className="exam-results">
              {(state.last?.results || []).map((row) => (
                <li key={row.id}><span className={`badge ${row.verdict === "correcta" ? "ok" : row.verdict === "parcial" ? "warn" : "danger"}`}>{VERDICT[row.verdict] || row.verdict}</span> {row.question}{row.learned ? <em className="muted small"> · aprendida</em> : null}<br /><span className="muted small">{row.product} · {row.reason}</span></li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
