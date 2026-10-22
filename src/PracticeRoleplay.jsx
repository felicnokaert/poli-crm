import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { OBJECTIONS, PLAYBOOKS } from "./commercial-knowledge.mjs";
import { AiText, askAi } from "./AssistantWindow.jsx";

// Práctica con la IA (22/10, Felipe): la IA hace de cliente (tipo de cliente + objeción elegidos) y el vendedor
// ensaya por escrito. "Pedir evaluación" la saca del personaje y puntúa con el método E-C-E-R-A. Cada ensayo
// gasta muy poco crédito (respuestas cortas, sin herramientas).
export function scenarioText(profile, objection, product = "") {
  return [
    `Tipo de cliente: ${profile.label} (le importa: ${profile.motivation}; su objeción típica: ${profile.typicalObjection}).`,
    `Objeción que tenés que sostener: "${objection.label}" (puede significar: ${objection.meaning}).`,
    product.trim() && `Producto que te interesa: ${product.trim()}.`,
  ].filter(Boolean).join(" ");
}

export function PracticeRoleplay({ supabase }) {
  const [profileId, setProfileId] = useState(PLAYBOOKS[0]?.id || "");
  const [objectionId, setObjectionId] = useState(OBJECTIONS[0]?.id || "");
  const [product, setProduct] = useState("");
  const [chat, setChat] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profile = PLAYBOOKS.find((item) => item.id === profileId) || PLAYBOOKS[0];
  const objection = OBJECTIONS.find((item) => item.id === objectionId) || OBJECTIONS[0];
  const scenario = scenarioText(profile, objection, product);

  async function send(message, current = chat) {
    if (!supabase?.auth || busy) return;
    setBusy(true); setError("");
    const history = current.map((turn) => ({ role: turn.role, text: turn.text }));
    // La charla la abre el cliente: para la IA, antes va la consigna de apertura (tiene que empezar por "user").
    if (history[0]?.role === "assistant") history.unshift({ role: "user", text: OPENING });
    const visible = message === "EVALUAR" ? "(Pedí la evaluación)" : message;
    const next = current.length || message !== OPENING ? [...current, { role: "user", text: message, shown: visible }] : current;
    setChat(next);
    const reply = await askAi(supabase, { mode: "practica", question: message, context: scenario, history }).catch(() => ({ ok: false, error: "Sin conexión." }));
    setBusy(false);
    if (!reply.ok) { setError(reply.error || "La IA no pudo responder."); return; }
    setChat([...next, { role: "assistant", text: reply.text, evaluation: message === "EVALUAR" }]);
  }

  function start() {
    setChat([]); setText("");
    send(OPENING, []);
  }

  if (!supabase) return null;
  return (
    <section className="panel practice-roleplay" aria-label="Practicar con la IA">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Ensayo</span>
          <h2>Practicar con un cliente (IA)</h2>
        </div>
        <Sparkles size={22} />
      </div>
      <p className="muted small">Elegí el tipo de cliente y la objeción: la IA hace de cliente y vos respondés como por WhatsApp. Cuando quieras, pedí la evaluación (método E-C-E-R-A, nota de 1 a 10).</p>
      <div className="practice-setup">
        <label>Tipo de cliente
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {PLAYBOOKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Objeción
          <select value={objectionId} onChange={(event) => setObjectionId(event.target.value)}>
            {OBJECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Producto (opcional)
          <input value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Ej.: Easyspray, resina epoxi" />
        </label>
        <button type="button" className="primary" disabled={busy} onClick={start}>{chat.length ? "Empezar otro ensayo" : "Empezar"}</button>
      </div>
      {chat.length > 0 && (
        <div className="practice-chat">
          {chat.map((turn, index) => (
            <div key={index} className={turn.role === "user" ? "assistant-msg-user" : "assistant-bubble assistant-msg-ai"}>
              <span className="muted small">{turn.role === "user" ? "Vos" : turn.evaluation ? "Evaluación" : "Cliente"}</span>
              {turn.role === "assistant" ? <AiText text={turn.text} /> : <p>{turn.shown || turn.text}</p>}
            </div>
          ))}
          <form className="practice-reply" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { const message = text.trim(); setText(""); send(message); } }}>
            <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Tu respuesta al cliente…" aria-label="Tu respuesta al cliente" disabled={busy} />
            <button type="submit" className="primary" disabled={busy || !text.trim()} aria-label="Responder"><Send size={15} /></button>
            <button type="button" className="secondary" disabled={busy || chat.length < 3} onClick={() => send("EVALUAR")}>Pedir evaluación</button>
          </form>
        </div>
      )}
      {busy && <p className="muted small" role="status">El cliente está escribiendo…</p>}
      {error && <p className="muted small" role="alert">{error}</p>}
    </section>
  );
}

const OPENING = "(Empezá vos: escribile al vendedor tu consulta como cliente, ya con la objeción del escenario.)";
