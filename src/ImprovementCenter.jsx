import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CHANNELS, mlEntries, percentClean, shopifyEntries, snapshotRows, trendOf, workList } from "./improvement-center.mjs";
import { Empty } from "./ui-primitives";

// Centro de mejoras (24/10): la lista de trabajo para dejar limpios Mercado Libre y Shopify. Cuánto falta de cada cosa,
// cómo viene bajando y un "Ver cuáles" que lleva directo a esas publicaciones o productos. Solo lee; no cambia nada afuera.
const argentinaToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const ML_COLUMNS = "id,seller_id,status,clips_count,pictures_count,description_length,health,available_quantity,sold_quantity,visits_30d,item_updated_at";
const OPEN_KEYS = { ml: "poliplast-open-ml", shopify: "poliplast-open-shopify" };

async function readAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// Abre el listado del canal ya filtrado (los tableros leen esta clave al montarse).
export function openIssue(channel, issue) {
  try { sessionStorage.setItem(OPEN_KEYS[channel], issue); } catch { /* sin sessionStorage */ }
}

function Spark({ series }) {
  if (series.length < 2) return <span className="muted small">—</span>;
  const max = Math.max(...series, 1);
  const w = 64;
  const h = 20;
  const points = series.map((value, index) => `${Math.round((index / (series.length - 1)) * w)},${Math.round(h - (value / max) * (h - 2) - 1)}`).join(" ");
  return <svg className="ic-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`De ${series[0]} a ${series.at(-1)}`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Health({ channel, data, history, today }) {
  const pct = percentClean(data);
  const trend = trendOf(history, channel, "_limpio", today, data?.clean ?? 0);
  const before = trend.since && history.find((row) => row.channel === channel && row.issue === "_limpio" && String(row.day).slice(0, 10) === trend.since);
  const pctBefore = before && before.total ? Math.round((before.count / before.total) * 100) : null;
  return (
    <article className={`ic-health ic-${channel}`}>
      <div className="ic-health-head"><span className={`chan-tag chan-${channel}`}>{CHANNELS[channel]}</span>{pct != null && pctBefore != null && <small className={pct >= pctBefore ? "ml-trend up" : "ml-trend down"}>{pct >= pctBefore ? "+" : ""}{pct - pctBefore} puntos desde el {trend.since.split("-").reverse().slice(0, 2).join("/")}</small>}</div>
      {pct == null ? <p className="muted small">Todavía sin datos.</p> : (
        <>
          <strong className="ic-pct">{pct} %</strong>
          <div className="ic-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
          <small className="muted">{data.clean} de {data.total} {channel === "ml" ? "publicaciones activas" : "productos"} sin nada para arreglar</small>
        </>
      )}
    </article>
  );
}

export function ImprovementCenter({ supabase, isAdmin, onOpen }) {
  const [state, setState] = useState({ status: "loading" });
  const [channel, setChannel] = useState("");
  const saved = useRef(false);
  const today = argentinaToday();

  useEffect(() => {
    if (!supabase?.from) { setState({ status: "offline" }); return undefined; }
    let alive = true;
    const since = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    const optional = (promise) => Promise.resolve(promise).catch(() => []);
    Promise.all([
      readAll(() => supabase.from("ml_items").select(ML_COLUMNS).order("id")),
      optional(readAll(() => supabase.from("ml_item_health").select("id,quality_level,quality_score,px_color").order("id"))),
      optional(readAll(() => supabase.from("shopify_products").select("*").order("id"))),
      optional(readAll(() => supabase.from("shopify_variants").select("id,product_id,sku,price,inventory_quantity").order("id"))),
      optional(readAll(() => supabase.from("improvement_snapshots").select("*").gte("day", since).order("day"))),
    ])
      .then(([items, health, products, variants, history]) => { if (alive) setState({ status: "ready", items, health, products, variants, history }); })
      .catch(() => { if (alive) setState({ status: "error" }); });
    return () => { alive = false; };
  }, [supabase]);

  const ml = useMemo(() => (state.status === "ready" ? mlEntries(state.items, state.health) : null), [state]);
  const shopify = useMemo(() => (state.status === "ready" && state.products.length ? shopifyEntries(state.products, state.variants) : null), [state]);

  // Foto de hoy: la guarda el administrador una vez por visita (para ver cómo baja de un día al otro).
  useEffect(() => {
    if (!isAdmin || saved.current || state.status !== "ready" || !supabase?.from) return;
    const rows = snapshotRows(today, ml, shopify);
    if (!rows.length) return;
    saved.current = true;
    Promise.resolve(supabase.from("improvement_snapshots").upsert(rows, { onConflict: "day,channel,issue" })).catch(() => {});
  }, [isAdmin, state, ml, shopify, supabase, today]);

  if (state.status === "loading") return <div className="ml-skeleton" role="status" aria-label="Cargando"><i /><i /><i /></div>;
  if (state.status === "offline") return <Empty text="El Centro de mejoras está en la versión en línea." />;
  if (state.status === "error") return <Empty text="No se pudieron leer los datos." />;

  const history = state.history || [];
  const all = [...(ml?.entries || []), ...(shopify?.entries || [])];
  const list = workList(all).filter((entry) => !channel || entry.channel === channel);

  return (
    <div className="content-stack ml-board improvement-center">
      <div className="ml-pane">
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Para vender más</span><h2>Centro de mejoras</h2>
            <p className="muted small">Lo que hay que arreglar en Mercado Libre y Shopify, de lo más urgente a lo menos. Cada vez que corregís algo allá, acá baja el número. {isAdmin ? "Se guarda una foto por día para ver el avance." : ""}</p></div></div>
          <div className="ic-health-grid">
            {ml && <Health channel="ml" data={ml} history={history} today={today} />}
            {shopify ? <Health channel="shopify" data={shopify} history={history} today={today} /> : <article className="ic-health ic-shopify"><div className="ic-health-head"><span className="chan-tag chan-shopify">Shopify</span></div><p className="muted small">Sin datos: conectá Shopify y tocá “Actualizar ahora” en Canales online → Shopify.</p></article>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Qué limpiar primero</span><h2>Lista de trabajo</h2></div>
            <div className="segmented" role="tablist" aria-label="Canal">
              {[["", "Todo"], ["ml", "Mercado Libre"], ["shopify", "Shopify"]].map(([key, label]) => <button key={key || "todo"} type="button" role="tab" aria-selected={channel === key} className={channel === key ? "selected" : ""} onClick={() => setChannel(key)}>{label}</button>)}
            </div>
          </div>
          {list.length === 0 ? <p className="muted">No hay nada para arreglar con los datos de hoy.</p> : (
            <div className="table-scroll"><table className="sales-history-table ic-table">
              <thead><tr><th>Canal</th><th>Qué arreglar</th><th>Cuántos</th><th>Avance</th><th></th></tr></thead>
              <tbody>{list.map((entry) => {
                const trend = trendOf(history, entry.channel, entry.key, today, entry.count);
                const Icon = trend.delta == null || trend.delta === 0 ? Minus : trend.delta < 0 ? ArrowDownRight : ArrowUpRight;
                return (
                  <tr key={`${entry.channel}-${entry.key}`} className={entry.clean ? "" : "ic-info"}>
                    <td><span className={`chan-tag chan-${entry.channel}`}>{CHANNELS[entry.channel]}</span></td>
                    <td><strong>{entry.label}</strong>{!entry.clean && <span className="badge"> informativo</span>}{entry.partial && <span className="badge warn"> parcial</span>}<div className="muted small">{entry.why}</div></td>
                    <td data-label="Cuántos"><strong>{entry.count.toLocaleString("es-AR")}</strong><span className="muted small"> de {entry.total.toLocaleString("es-AR")}</span><div className="ic-bar thin" aria-hidden="true"><i style={{ width: `${Math.round((entry.count / Math.max(entry.total, 1)) * 100)}%` }} /></div></td>
                    <td data-label="Avance"><div className={`ic-trend ${trend.delta < 0 ? "good" : trend.delta > 0 ? "bad" : ""}`}><span><Icon size={14} /> {trend.delta == null ? "sin historial" : trend.delta === 0 ? "sin cambios" : `${trend.delta > 0 ? "+" : ""}${trend.delta} en 7 días`}</span><Spark series={trend.series} /></div></td>
                    <td><button type="button" className="secondary" onClick={() => { openIssue(entry.channel, entry.key); onOpen(entry.channel === "ml" ? "mercadolibre" : "shopify"); }}>Ver cuáles</button></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </div>
  );
}
