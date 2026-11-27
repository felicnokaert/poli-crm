import { useEffect, useState } from "react";

// Poliplast App (25/11): la cuenta de expedición es UNA sola que usan varios. Al entrar se elige quién es y desde
// qué depósito; queda en este equipo hasta que se toque «Cambiar». En la app real la lista sale de Entregas
// (entregas_config: operadores y depósitos), con los mismos nombres que Entregas («Juan», no «Juan M.»); sin base,
// la lista de respaldo es la misma de Entregas al 27/11. Braian es de Mar del Plata; el resto, de Villa Domínico.
export const DEFAULT_OPERATORS = [["Marcos", "Villa Domínico"], ["Neyen", "Villa Domínico"], ["Jeremías", "Villa Domínico"], ["Facundo", "Villa Domínico"], ["Juan", "Villa Domínico"], ["Braian", "Mar del Plata"], ["Diego", "Villa Domínico"]];
export const DEMO_OPERATORS = DEFAULT_OPERATORS;
export const DEPOSITS = ["Villa Domínico", "Mar del Plata"];
const HOME = { Braian: "Mar del Plata" };
export function operatorsFrom(names) {
  const list = (Array.isArray(names) ? names : []).map((name) => String(name || "").trim()).filter((name) => name && name !== "Felipe");
  return list.length ? list.map((name) => [name, HOME[name] || "Villa Domínico"]) : DEFAULT_OPERATORS;
}
// Lee la lista real de Entregas (la cuenta de expedición tiene permiso de leer entregas_config).
export function useExpeditionOperators(supabase) {
  const [operators, setOperators] = useState(DEFAULT_OPERATORS);
  useEffect(() => {
    if (!supabase?.from) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("entregas_config").select("operadores").limit(1).maybeSingle();
        if (alive && data?.operadores) setOperators(operatorsFrom(data.operadores));
      } catch { /* queda la lista de respaldo */ }
    })();
    return () => { alive = false; };
  }, [supabase]);
  return operators;
}
export const EXPEDITION_KEY = "poliplast-app-expedicion";

export function readExpeditionWho(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(EXPEDITION_KEY)) || null; } catch { return null; }
}
export function saveExpeditionWho(value, storage = globalThis.localStorage) {
  try { if (value) storage?.setItem(EXPEDITION_KEY, JSON.stringify(value)); else storage?.removeItem(EXPEDITION_KEY); } catch { /* sin almacenamiento */ }
}

export function ExpeditionGate({ operators = DEFAULT_OPERATORS, onPick }) {
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
      <p className="muted small">Se elige una sola vez y vale para todas las pantallas (Entregas, Conteo, Etiquetas, Dosificado). Si lo usa otra persona, tocá «Cambiar» arriba.</p>
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
