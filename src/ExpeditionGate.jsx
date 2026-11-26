import { useState } from "react";

// Poliplast App (25/11): la cuenta de expedición es UNA sola que usan varios. Al entrar se elige quién es y desde
// qué depósito; queda en este equipo hasta que se toque «Cambiar». En la app real la lista sale de Entregas
// (entregas_config: operadores y depósitos); en la prueba, de esta lista inventada.
export const DEMO_OPERATORS = [["Braian", "Mar del Plata"], ["Matías", "Villa Domínico"], ["Leandro", "Villa Domínico"], ["Diego", "Villa Domínico"]];
export const DEPOSITS = ["Villa Domínico", "Mar del Plata"];
export const EXPEDITION_KEY = "poliplast-app-expedicion";

export function readExpeditionWho(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(EXPEDITION_KEY)) || null; } catch { return null; }
}
export function saveExpeditionWho(value, storage = globalThis.localStorage) {
  try { if (value) storage?.setItem(EXPEDITION_KEY, JSON.stringify(value)); else storage?.removeItem(EXPEDITION_KEY); } catch { /* sin almacenamiento */ }
}

export function ExpeditionGate({ operators = DEMO_OPERATORS, onPick }) {
  const [who, setWho] = useState("");
  const [deposit, setDeposit] = useState("");
  return (
    <section className="panel expedition-gate">
      <span className="eyebrow">Cuenta de expedición</span>
      <h2>¿Quién sos?</h2>
      <div className="expedition-options">
        {operators.map(([name, home]) => (
          <button key={name} type="button" className={who === name ? "primary" : "secondary"} onClick={() => { setWho(name); if (!deposit) setDeposit(home); }}>{name}</button>
        ))}
      </div>
      <h2>¿Desde qué depósito?</h2>
      <div className="expedition-options">
        {DEPOSITS.map((name) => (
          <button key={name} type="button" className={deposit === name ? "primary" : "secondary"} onClick={() => setDeposit(name)}>{name}</button>
        ))}
      </div>
      <button type="button" className="primary expedition-go" disabled={!who || !deposit} onClick={() => onPick({ who, deposit, at: new Date().toISOString() })}>Entrar</button>
      <p className="muted small">Queda elegido en este celular o compu. Si lo usa otra persona, tocá «Cambiar» arriba.</p>
    </section>
  );
}

export function ExpeditionChip({ value, onChange }) {
  if (!value) return null;
  return (
    <div className="expedition-chip" role="status">
      <span><b>{value.who}</b> · {value.deposit}</span>
      <button type="button" className="secondary" onClick={() => onChange(null)}>Cambiar</button>
    </div>
  );
}
