import { useState } from "react";
import { DEFAULT_WEEKLY_TARGETS, WEEKLY_TARGET_FIELDS, normalizeTarget, resolveWeeklyTargets } from "./weekly-targets.mjs";

// Metas semanales (27/11, Felipe: «eso debe estar en Ventas»). Antes vivían en Perfil; es el mismo dato
// (data.weeklyTargets), así que lo que cada uno ya cargó sigue igual.
export function WeeklyTargets({ data, setData }) {
  const [targets, setTargets] = useState(() => resolveWeeklyTargets(data.weeklyTargets));
  const [message, setMessage] = useState("");

  function saveTargets(event) {
    event.preventDefault();
    const next = {};
    for (const [key, label] of WEEKLY_TARGET_FIELDS) {
      const value = normalizeTarget(targets[key]);
      if (!value) {
        setMessage(`"${label}": escribí un número (15) o un rango (8–10).`);
        return;
      }
      next[key] = value;
    }
    setTargets(next);
    setData((current) => ({ ...current, weeklyTargets: next }));
    setMessage("Metas guardadas.");
  }

  function resetTargets() {
    setTargets({ ...DEFAULT_WEEKLY_TARGETS });
    setData((current) => { const { weeklyTargets: _removed, ...rest } = current; return rest; });
    setMessage("Volviste a las metas por defecto.");
  }

  return (
    <section className="panel weekly-targets-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Tu semana</span>
          <h2>Metas semanales</h2>
        </div>
      </div>
      <p>Son las metas que ves en Inicio. Podés usar un número (15) o un rango (8–10).</p>
      <form className="form-grid" onSubmit={saveTargets}>
        {WEEKLY_TARGET_FIELDS.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={targets[key]}
              onChange={(event) => setTargets({ ...targets, [key]: event.target.value })}
              placeholder={DEFAULT_WEEKLY_TARGETS[key]}
              inputMode="numeric"
            />
          </label>
        ))}
        <div className="modal-actions span-2">
          <button className="secondary" type="button" onClick={resetTargets}>Valores por defecto</button>
          <button className="primary" type="submit">Guardar metas</button>
        </div>
      </form>
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}
