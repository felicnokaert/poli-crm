import { useState } from "react";
import { FUTURE_MODULES, ROLES, SUBMODULES } from "./poliplast-app-plan.mjs";

// Poliplast App (prueba): pantalla de un módulo que todavía no existe adentro de la app.
export function ModulePreview({ id }) {
  const module = FUTURE_MODULES[id];
  const subs = SUBMODULES[id] || [];
  const [tab, setTab] = useState(subs[0] || "");
  if (!module) return null;
  return (
    <section className="panel module-preview">
      <span className="eyebrow">Próximamente · {module.status}</span>
      <h2>{module.label}</h2>
      <p className="muted">{module.text}</p>
      {subs.length > 0 && (
        <div className="segmented" role="tablist" aria-label={`Submódulos de ${module.label}`} style={{ margin: "12px 0", width: "fit-content", flexWrap: "wrap" }}>
          {subs.map((sub) => (
            <button key={sub} type="button" role="tab" aria-selected={tab === sub} className={tab === sub ? "selected" : ""} onClick={() => setTab(sub)}>{sub}</button>
          ))}
        </div>
      )}
      <div className="module-preview-empty">
        <strong>{tab}</strong>
        <p className="muted small">Así se va a ubicar en el menú. Todavía no tiene datos: es una vista de cómo se vería.</p>
      </div>
      <p className="muted small">
        Lo ven: {ROLES.filter((role) => role.modules === null || role.modules.includes(id)).map((role) => role.label).join(", ")}.
      </p>
    </section>
  );
}

// Poliplast App (prueba): el mapa completo del menú con submódulos y qué ve cada rol.
export function AppPlanOverview({ groups, role = "admin", onRole = null, onResetDemo = null }) {
  return (
    <section className="panel module-preview">
      <span className="eyebrow">Poliplast App · versión de prueba</span>
      <h2>Cómo queda la app</h2>
      <p className="muted">
        Menú por grupos, cada módulo con sus submódulos (pestañas). Con «Ver como» (abajo del menú) se ve lo que tendría cada rol.
        Lo marcado «próximamente» todavía no existe acá. Esta versión es solo para Felipe: los vendedores y expedición siguen con la de siempre.
      </p>
      {onRole && (
        <label className="preview-role" style={{ maxWidth: 320 }}>
          <span className="eyebrow">Ver el menú como</span>
          <select value={role} onChange={(event) => onRole(event.target.value)}>
            {ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
      {onResetDemo && (
        <p className="muted small">Estás en la versión de prueba con datos inventados. <button type="button" className="secondary" onClick={onResetDemo}>Volver a cargar los datos de prueba</button></p>
      )}
      <div className="plan-overview-grid">
        {groups.map(([group, items]) => (
          <div key={group} className="plan-overview-group">
            <h3>{group}</h3>
            <ul>
              {items.map(([id, label]) => (
                <li key={id}>
                  <strong>{label}</strong>{FUTURE_MODULES[id] && <span className="plan-soon"> próximamente</span>}
                  {(SUBMODULES[id] || []).length > 0 && <span className="muted small"> · {(SUBMODULES[id] || []).join(" · ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3>Roles</h3>
      <table className="plan-roles">
        <thead><tr><th>Rol</th><th>Qué ve</th></tr></thead>
        <tbody>
          {ROLES.map((role) => (
            <tr key={role.id}>
              <td><strong>{role.label}</strong></td>
              <td className="muted small">
                {role.modules === null ? "Todo" : groups.flatMap(([, items]) => items).filter(([id]) => role.modules.includes(id) || id === "profile").map(([, label]) => label).join(", ")}
                {role.id === "expedicion" && " (cuenta compartida: elige quién es y desde qué depósito; en Entregas no carga remitos)"}
                {role.id === "deposito" && " (sin datos de ventas)"}
                {role.id === "administrativo" && " (a definir con Felipe)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
