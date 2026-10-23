import { useEffect, useState } from "react";
import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { SEVERITY_LABEL, groupAlerts } from "./crm-alerts.mjs";

const DATA_SECTION_KEY = "poliplast-data-section";
const store = (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* sin almacenamiento: abre igual */ } };

// Lleva a la pantalla donde se arregla cada alerta (y la deja filtrada si corresponde).
function openAlert(link = {}, onNavigate) {
  if (!link.view) return;
  if (link.view === "mercadolibre" && link.issue) store("poliplast-open-ml", link.issue);
  if (link.view === "shopify") store("poliplast-open-shopify", link.tab && link.tab !== "productos" ? `tab:${link.tab}` : link.issue || "tab:productos");
  if (link.view === "settings" && link.section) store(DATA_SECTION_KEY, link.section);
  onNavigate?.(link.view);
}

// "Qué atender hoy" (24/10): lo que dejó el servidor en crm_alerts, ordenado por gravedad y con los días que lleva cada una.
export function AttentionPanel({ supabase, session, isAdmin, onNavigate, compact = false }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase?.from) return;
    const { data, error } = await supabase.from("crm_alerts").select("*").is("resolved_at", null);
    setRows(error ? [] : data || []);
    if (error) setMessage("Todavía no está la tabla de alertas.");
  }
  useEffect(() => { load(); }, [supabase]);

  async function refresh() {
    setBusy(true); setMessage("");
    try {
      const response = await adminFetch({ action: "alerts" }, session?.access_token);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      setMessage(`Alertas al día: ${body.active} activas, ${body.resolved} resueltas.`);
      await load();
    } catch (error) { setMessage(error.message || "No se pudo actualizar."); }
    setBusy(false);
  }

  if (rows === null) return null;
  const groups = groupAlerts(rows);
  if (!groups.total && !isAdmin && compact) return null;
  const shown = compact ? ["alta", "media"] : ["alta", "media", "baja"];
  return (
    <section className="panel attention-panel" aria-label="Qué atender hoy">
      <div className="panel-head">
        <div><span className="eyebrow">Se actualiza sola cada día · nada se cambia solo</span><h2>Qué atender hoy</h2></div>
        {isAdmin && <button type="button" className="ghost" disabled={busy} onClick={refresh}><RefreshCw size={15} /> {busy ? "Revisando…" : "Actualizar"}</button>}
      </div>
      {message && <p className="muted small">{message}</p>}
      {!groups.total && <p className="muted small"><CircleCheck size={14} /> Nada urgente por ahora.{isAdmin ? " Si recién se publicó, tocá Actualizar." : ""}</p>}
      {shown.map((severity) => groups[severity].length > 0 && (
        <div key={severity} className={`attention-group attention-${severity}`}>
          <h3>{SEVERITY_LABEL[severity]} ({groups[severity].length})</h3>
          <ul className="ml-alerts">
            {groups[severity].slice(0, compact ? 5 : 30).map((alert) => (
              <li key={`${alert.type}|${alert.entity_id}`} className={severity === "alta" ? "is-urgent" : ""}>
                <TriangleAlert size={16} aria-hidden="true" />
                <span><strong>{alert.title}</strong>{alert.days >= 1 && <small className="muted"> · hace {alert.days} {alert.days === 1 ? "día" : "días"}</small>}{alert.detail ? <small className="muted"> · {alert.detail}</small> : null}</span>
                {alert.link?.view && <button type="button" className="secondary" onClick={() => openAlert(alert.link, onNavigate)}>Ver</button>}
              </li>
            ))}
          </ul>
          {compact && groups[severity].length > 5 && <p className="muted small">y {groups[severity].length - 5} más en el Centro de mejoras.</p>}
        </div>
      ))}
    </section>
  );
}
