import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { COSTS, STATUSES, VERDICTS, VERDICT_ORDER, bubblePositions, mergeIdeas, newIdea, patchIdea, sortIdeas, verdictCounts } from "./automation-matrix.mjs";

const SCALE = [1, 2, 3, 4, 5];

// Sección Automatizaciones (dentro de Tareas, solo Felipe): qué conviene automatizar, con impacto × facilidad × costo.
export function AutomationMatrix({ automations = {}, onChange }) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState({ name: "", area: "Otras" });
  const ideas = sortIdeas(mergeIdeas(automations));
  const counts = verdictCounts(ideas);
  const positions = bubblePositions(ideas);
  const byId = Object.fromEntries(positions.map((item) => [item.id, item]));
  const change = (id, patch) => onChange?.(patchIdea(automations, id, patch));
  const add = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onChange?.(newIdea(automations, draft));
    setDraft({ name: "", area: draft.area });
  };

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Qué conviene automatizar</span>
            <h2>Automatizaciones</h2>
            <p>Cada idea se puntúa por impacto en el negocio, facilidad y costo. El veredicto sale solo. Los puntajes de partida son una estimación: editalos.</p>
          </div>
        </div>
        <div className="matrix-cards">
          {VERDICT_ORDER.map((key) => (
            <article key={key} className="matrix-card" style={{ borderTopColor: VERDICTS[key].color }}>
              <strong style={{ color: VERDICTS[key].color }}>{counts[key]}</strong>
              <span>{VERDICTS[key].label}</span>
              <small>{VERDICTS[key].help}</small>
            </article>
          ))}
        </div>
        <div className="matrix-chart-wrap">
          <div className="matrix-chart" role="img" aria-label="Gráfico de burbujas: facilidad hacia la derecha, impacto hacia arriba">
            <span className="matrix-axis matrix-axis-y">Impacto en el negocio →</span>
            <span className="matrix-axis matrix-axis-x">Facilidad de hacerlo →</span>
            <i className="matrix-mid matrix-mid-x" /><i className="matrix-mid matrix-mid-y" />
            {ideas.map((idea) => {
              const pos = byId[idea.id];
              return (
                <button key={idea.id} type="button" className={`matrix-bubble${selected === idea.id ? " active" : ""}`}
                  style={{ left: `${pos.left}%`, bottom: `${pos.bottom}%`, width: pos.size, height: pos.size, background: VERDICTS[idea.verdict].color }}
                  title={`${idea.name} · ${VERDICTS[idea.verdict].label}`} aria-label={`${pos.number}. ${idea.name}`}
                  onClick={() => setSelected(selected === idea.id ? "" : idea.id)}>
                  {pos.number}
                </button>
              );
            })}
          </div>
          <ul className="matrix-legend">
            {VERDICT_ORDER.map((key) => <li key={key}><i style={{ background: VERDICTS[key].color }} />{VERDICTS[key].label}</li>)}
            <li className="muted">El tamaño de la burbuja es el costo.</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Lista</span><h2>Ideas ordenadas por conveniencia</h2></div></div>
        <div className="matrix-list">
          {ideas.map((idea) => (
            <article key={idea.id} className={`matrix-row${selected === idea.id ? " active" : ""}`} onClick={() => setSelected(idea.id)}>
              <span className="matrix-num" style={{ background: VERDICTS[idea.verdict].color }}>{byId[idea.id].number}</span>
              <div className="matrix-main">
                <strong>{idea.name}</strong>
                <small>{idea.area} · {STATUSES[idea.status]} · <b style={{ color: VERDICTS[idea.verdict].color }}>{VERDICTS[idea.verdict].label}</b></small>
              </div>
              <div className="matrix-controls" onClick={(event) => event.stopPropagation()}>
                <label>Impacto<select value={idea.impact} onChange={(event) => change(idea.id, { impact: event.target.value })}>{SCALE.map((n) => <option key={n}>{n}</option>)}</select></label>
                <label>Facilidad<select value={idea.ease} onChange={(event) => change(idea.id, { ease: event.target.value })}>{SCALE.map((n) => <option key={n}>{n}</option>)}</select></label>
                <label>Costo<select value={idea.cost} onChange={(event) => change(idea.id, { cost: event.target.value })}>{COSTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label>Estado<select value={idea.status} onChange={(event) => change(idea.id, { status: event.target.value })}>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="matrix-check"><input type="checkbox" checked={idea.risk} onChange={(event) => change(idea.id, { risk: event.target.checked })} />Envía al cliente o escribe en un sistema</label>
                <label className="matrix-check"><input type="checkbox" checked={idea.human} onChange={(event) => change(idea.id, { human: event.target.checked })} />La IA propone y una persona decide</label>
                {idea.custom ? (
                  <button type="button" className="danger-link" onClick={() => change(idea.id, { removed: true })}><Trash2 size={14} /> Quitar</button>
                ) : (
                  automations[idea.id] && <button type="button" className="ghost" onClick={() => onChange?.({ ...automations, [idea.id]: undefined })}><RotateCcw size={14} /> Valores de partida</button>
                )}
              </div>
            </article>
          ))}
        </div>
        <form className="matrix-add" onSubmit={add}>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Agregar una idea de automatización…" aria-label="Nueva idea" />
          <select value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value })} aria-label="Área">
            {["WhatsApp", "Redes", "Ventas", "Operación", "Mercado Libre", "Shopify", "Otras"].map((area) => <option key={area}>{area}</option>)}
          </select>
          <button type="submit" className="primary"><Plus size={15} /> Agregar</button>
        </form>
      </section>
    </div>
  );
}
