import { useEffect, useState } from "react";
import { CircleCheck, CircleHelp, CircleX, Plug, RefreshCw, TriangleAlert } from "lucide-react";
import { HEALTH_SOURCES, STATUS_LABEL, contabiliumRows, evaluate, healthSummary, mlAccountRows } from "./data-health.mjs";

const ICON = { ok: CircleCheck, late: TriangleAlert, old: CircleX, error: CircleX, empty: CircleHelp, idle: CircleHelp };

async function latest(supabase, source) {
  const [{ data, error }, { count }] = await Promise.all([
    supabase.from(source.table).select(source.column).order(source.column, { ascending: false }).limit(1),
    supabase.from(source.table).select("*", { count: "exact", head: true }),
  ]);
  if (error) return { ...source, status: "empty", text: "No se pudo leer (¿falta la tabla?).", count: 0 };
  return { ...source, ...evaluate({ at: data?.[0]?.[source.column], maxHours: source.maxHours, dateOnly: source.dateOnly, optional: source.optional && !count }), count: count ?? 0 };
}

// Panel "Conexiones" (Más → Datos, solo administrador): de dónde vienen los datos y si están al día.
export function DataHealth({ supabase }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    const [sources, accounts, sync] = await Promise.all([
      Promise.all(HEALTH_SOURCES.map((source) => latest(supabase, source))),
      supabase.rpc("ml_account_names"),
      supabase.from("contabilium_sync").select("company, last_run_at, last_error, history_done, total_saved"),
    ]);
    const now = Date.now();
    setRows([...mlAccountRows(accounts.data || [], now), ...sources, ...contabiliumRows(sync.data || [], now)]);
    setBusy(false);
  }
  useEffect(() => { load(); }, []);

  const summary = healthSummary(rows || []);
  const groups = rows ? [...new Set(rows.map((row) => row.group))] : [];
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><Plug size={18} /> Conexiones y salud de los datos</h2>
          <p>Cuándo se actualizó cada fuente por última vez. Las que tienen actualización diaria se marcan atrasadas pasadas 36 horas.</p>
        </div>
        <button type="button" className="ghost" disabled={busy} onClick={load}><RefreshCw size={15} /> {busy ? "Revisando…" : "Revisar de nuevo"}</button>
      </div>
      {rows === null && <p className="muted">Revisando…</p>}
      {rows && (
        <p className={summary.attention ? "system-message" : "muted"}>
          {summary.attention
            ? `${summary.attention} de ${summary.total} necesitan atención${summary.worst ? `: ${summary.worst.group} · ${summary.worst.label}` : ""}.`
            : `Todo al día (${summary.total} fuentes revisadas).`}
        </p>
      )}
      {groups.map((group) => (
        <div key={group} className="health-group">
          <h3>{group}</h3>
          <ul className="health-list">
            {rows.filter((row) => row.group === group).map((row) => {
              const Icon = ICON[row.status] || CircleHelp;
              return (
                <li key={row.id} className={`health-row health-${row.status}`}>
                  <Icon size={16} aria-hidden="true" />
                  <span className="health-label">{row.label}{row.note ? <small className="muted"> · {row.note}</small> : null}</span>
                  <span className="health-count">{row.count ? `${row.count.toLocaleString("es-AR")} filas` : ""}</span>
                  <span className="health-state"><strong>{STATUS_LABEL[row.status]}</strong> · {row.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="muted small">Si algo está atrasado: Más → Datos → Mercado Libre → "Actualizar todo", o Contabilium → "Traer comprobantes". Shopify se actualiza solo cada día a las 7:30 (hora argentina).</p>
    </section>
  );
}
