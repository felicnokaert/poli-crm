import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { DEFAULT_RULES, RULE_GROUPS, changedRules, isDefault, normalizeRules } from "./prospect-rules.mjs";

// Prospección → Reglas (24/10): cómo se ordena la cola de a quién contactar y qué radio se busca según la ciudad.
// Los valores de fábrica son los de siempre; cada cambio se guarda en tu espacio y se aplica enseguida.
export function ProspectRulesPanel({ rules, onChange }) {
  const current = normalizeRules(rules);
  const [message, setMessage] = useState("");
  const set = (key, value) => { onChange(changedRules({ ...current, [key]: value })); setMessage(""); };
  return (
    <section className="panel prospect-rules">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cómo se ordena la cola</span>
          <h2>Reglas de prospección</h2>
          <p className="muted small">Cada punto sube al prospecto en la Cola del día. Los puntos de la investigación profunda (hasta 5) no se tocan acá. El radio se usa en las búsquedas nuevas.</p>
        </div>
        {!isDefault(rules) && <button type="button" className="ghost" onClick={() => { onChange({}); setMessage("Volvieron los valores de fábrica."); }}><RotateCcw size={15} /> Valores de fábrica</button>}
      </div>
      {message && <p className="muted small">{message}</p>}
      {RULE_GROUPS.map(([title, fields]) => (
        <div key={title} className="rules-group">
          <h3>{title}</h3>
          <div className="rules-grid">
            {fields.map(([key, label, unit, min, max]) => (
              <label key={key} className={`rule-field ${current[key] !== DEFAULT_RULES[key] ? "is-changed" : ""}`}>
                <span>{label}</span>
                <span className="rule-input">
                  <input type="number" inputMode="numeric" min={min} max={max} value={current[key]} onChange={(event) => set(key, event.target.value)} aria-label={label} />
                  <small className="muted">{unit}{current[key] !== DEFAULT_RULES[key] ? ` (antes ${DEFAULT_RULES[key].toLocaleString("es-AR")})` : ""}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
