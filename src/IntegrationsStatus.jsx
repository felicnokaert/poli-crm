import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { integrationsStatus, needsAttention } from "./integrations-status.mjs";

// Más → Datos → "Actualizaciones automáticas" y aviso en Inicio (23/10, Felipe: "que todo se actualice solo una
// vez por día; si falla, es porque algo pasa"). Lee lo que deja el servidor en crm_system_status.
export const DATA_SECTION_KEY = "poliplast-data-section";

function useIntegrations(supabase) {
  const [state, setState] = useState({ status: "loading", list: [] });
  useEffect(() => {
    if (!supabase?.from) return undefined;
    let alive = true;
    Promise.resolve(supabase.from("crm_system_status").select("key,last_run_at,ok,detail"))
      .then(({ data, error }) => { if (!alive) return; if (error) throw error; setState({ status: "ready", list: integrationsStatus(data || []) }); })
      .catch(() => { if (alive) setState({ status: "error", list: [] }); });
    return () => { alive = false; };
  }, [supabase]);
  return state;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ICON = { ok: CircleCheck, partial: CircleAlert, running: Clock };
const TONE = { ok: "ok", partial: "warn", running: "", never: "", failed: "bad", cut: "bad", stale: "bad", skipped: "warn" };

export function IntegrationsStatus({ supabase }) {
  const { status, list } = useIntegrations(supabase);
  return (
    <section className="panel integrations-status">
      <div className="panel-head"><div><span className="eyebrow">Todos los días, solas</span><h2>Actualizaciones automáticas</h2>
        <p className="muted small">Cada mañana el CRM trae solo lo nuevo de Mercado Libre, Contabilium y Shopify, sin tocar ningún botón. Si alguna falla o se corta, aparece acá (y un aviso en Inicio). Los botones de cada pantalla siguen sirviendo para traer todo en el momento.</p></div></div>
      {status === "loading" && <p className="muted" role="status">Cargando…</p>}
      {status === "error" && <p className="muted">No se pudo leer el estado.</p>}
      {status === "ready" && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Qué</th><th>Horario</th><th>Última vez</th><th>Estado</th></tr></thead>
          <tbody>{list.map((entry) => {
            const Icon = ICON[entry.state] || CircleAlert;
            return (
              <tr key={entry.key}>
                <td>{entry.name}</td>
                <td>{entry.when} h</td>
                <td>{when(entry.at)}{entry.seconds != null ? <div className="muted small">{entry.seconds} s</div> : null}</td>
                <td><span className={`integration-state ${TONE[entry.state] || ""}`}><Icon size={14} /> {entry.label}</span>
                  {entry.problems.length > 0 && <ul className="muted small integration-problems">{entry.problems.slice(0, 4).map((problem) => <li key={problem}>{problem}</li>)}</ul>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </section>
  );
}

// Aviso de Inicio (solo Felipe): aparece únicamente si algo falló, se cortó o no corre.
export function IntegrationsAlert({ supabase, onNavigate }) {
  const { status, list } = useIntegrations(supabase);
  const bad = status === "ready" ? needsAttention(list) : [];
  if (!bad.length) return null;
  const open = () => { try { sessionStorage.setItem(DATA_SECTION_KEY, "automaticas"); } catch { /* sin almacenamiento */ } onNavigate?.("settings"); };
  return (
    <div className="automation-note is-warning">
      <CircleAlert size={15} />
      <span>⚠️ {bad.length === 1 ? "Una actualización automática" : `${bad.length} actualizaciones automáticas`} con problemas: {bad.map((entry) => `${entry.name.split(":")[0]} (${entry.label.toLowerCase()})`).join(" · ")}. <button type="button" className="link-button" onClick={open}>Ver detalle</button></span>
    </div>
  );
}
