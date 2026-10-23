import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { colorLabel, improvePlan } from "./ml-improve.mjs";
import { loadHealth } from "./ml-improve-data.js";

// Ventas → Mercado Libre → "Qué mejorar" (23/10): lo que Mercado Libre dice de cada publicación (calidad y
// experiencia de compra) más lo que ya sabemos, ordenado por impacto. Solo muestra; los cambios se hacen en ML.
const SHOW = 25;

function Title({ item, nickname }) {
  return (
    <>
      <a href={item.permalink} target="_blank" rel="noreferrer">{String(item.title || item.id).slice(0, 70)} <ExternalLink size={11} /></a>
      <div className="muted small">{nickname[item.seller_id] || "cuenta"} · {Number(item.visits_30d) || 0} visitas/30 días · {Number(item.sold_quantity) || 0} vendidas</div>
    </>
  );
}

function Section({ title, hint, rows, render, empty }) {
  const [shown, setShown] = useState(SHOW);
  return (
    <section className="panel ml-improve-section">
      <div className="panel-head"><div><h2>{title}</h2><p className="muted small">{hint}</p></div></div>
      {rows.length === 0 ? <p className="muted">{empty}</p> : (
        <div className="table-scroll">
          <table className="sales-history-table">
            <tbody>{rows.slice(0, shown).map(render)}</tbody>
          </table>
        </div>
      )}
      {rows.length > shown && <button type="button" className="secondary" onClick={() => setShown((count) => count + SHOW)}>Ver {Math.min(SHOW, rows.length - shown)} más ({shown} de {rows.length})</button>}
    </section>
  );
}

export function MlImprove({ supabase, items = [], seller = "", nickname = {} }) {
  const [state, setState] = useState({ status: "loading", health: [] });
  useEffect(() => {
    let alive = true;
    loadHealth(supabase)
      .then((health) => { if (alive) setState({ status: "ready", health }); })
      .catch((error) => { if (alive) setState({ status: /ml_item_health|does not exist|schema cache/i.test(String(error?.message || "")) ? "missing" : "error", health: [] }); });
    return () => { alive = false; };
  }, [supabase]);
  const plan = useMemo(() => improvePlan({ items, health: state.health, seller }), [items, state.health, seller]);

  if (state.status === "loading") return <p className="muted" role="status">Leyendo la calidad de las publicaciones…</p>;
  if (state.status === "missing") return <p className="muted">Falta un paso: pegar el SQL de docs/SQL_PENDIENTE_2026-10-23.md en Supabase. Después tocá "Actualizar todo" en Más → Datos → Mercado Libre.</p>;
  if (state.status === "error") return <p className="muted">No se pudo leer la calidad de las publicaciones.</p>;
  const { summary } = plan;
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Lo que dice Mercado Libre de cada publicación</span>
            <h2>Qué mejorar primero</h2>
            <p className="muted small">
              Revisadas {summary.checked} de {summary.active} activas{summary.averageScore != null ? ` · calidad promedio ${summary.averageScore}/100` : ""}
              {Object.keys(summary.levels).length ? ` · ${Object.entries(summary.levels).map(([level, count]) => `${count} ${level}`).join(", ")}` : ""}.
              {" "}Ordenado por impacto: primero lo que más se ve y más vende. Se completa solo cada día (unas 15 por cuenta) o con "Actualizar todo" en Más → Datos → Mercado Libre.
            </p>
          </div>
        </div>
        {summary.checked === 0 && <p className="muted">Todavía no hay publicaciones revisadas: tocá "Actualizar todo" en Más → Datos → Mercado Libre. Si Mercado Libre no da permiso, el aviso lo dice ahí.</p>}
      </section>
      <Section
        title={`Calidad por debajo de Profesional (${summary.lowQuality})`}
        hint="Lo que Mercado Libre pide para subir la calidad, con el link para editarla. Más calidad = más exposición."
        rows={plan.quality}
        empty="Ninguna revisada está por debajo de Profesional."
        render={({ item, h, actions }) => (
          <tr key={item.id}>
            <td><Title item={item} nickname={nickname} /></td>
            <td><strong>{h.quality_level || "—"}</strong>{typeof h.quality_score === "number" && <div className="muted small">{h.quality_score}/100</div>}</td>
            <td>{actions.length ? actions.map((action, index) => <div key={`${action.key}-${index}`}>{action.link ? <a href={action.link} target="_blank" rel="noreferrer">{action.label || action.title}</a> : (action.label || action.title)}{action.label && action.title && action.label !== action.title && <span className="muted small"> · {action.title}</span>}</div>) : <span className="muted small">sin detalle</span>}</td>
          </tr>
        )}
      />
      <Section
        title={`Experiencia de compra con problemas (${summary.badExperience})`}
        hint="Reclamos, cancelaciones o demoras en esa publicación. Es lo que más cuida la reputación."
        rows={plan.experience}
        empty="Ninguna revisada tiene problemas de experiencia de compra."
        render={({ item, h }) => (
          <tr key={item.id}>
            <td><Title item={item} nickname={nickname} /></td>
            <td><strong>{colorLabel(h.px_color)}</strong>{h.px_label && <div className="muted small">{h.px_label}</div>}</td>
            <td>{(h.px_problems || []).length ? h.px_problems.map((problem, index) => <div key={index}>{problem.title}{problem.quantity != null ? ` (${problem.quantity})` : ""}{problem.remedy && <div className="muted small">{problem.remedy}</div>}</div>) : <span className="muted small">sin detalle</span>}</td>
          </tr>
        )}
      />
      <Section
        title={`Muchas visitas y nunca vendieron (${summary.noSales})`}
        hint="50 o más visitas en 30 días y ninguna venta. Al lado, lo que les falta; si no les falta nada, mirá precio y competencia."
        rows={plan.noSales}
        empty="No hay publicaciones con muchas visitas sin ventas."
        render={({ item, reasons }) => (
          <tr key={item.id}>
            <td><Title item={item} nickname={nickname} /></td>
            <td colSpan={2}>{reasons.length ? reasons.join(" · ") : <span className="muted">revisar precio y competencia</span>}</td>
          </tr>
        )}
      />
    </div>
  );
}
