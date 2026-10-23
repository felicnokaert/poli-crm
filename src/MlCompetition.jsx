import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { competitionRows, competitorSummary, trendsView } from "./ml-competition-view.mjs";

// Ventas → Mercado Libre → "Competencia" y "Tendencias" (23/10). Felipe pega links de publicaciones de la
// competencia; cada día se guarda su precio y vendidas para ver cuánto venden y cómo mueven el precio, contra
// nuestra publicación vinculada. Tendencias: lo más buscado en nuestras categorías. Solo lee Mercado Libre.
const money = (value) => (typeof value === "number" ? `$ ${Math.round(value).toLocaleString("es-AR")}` : "—");
const signed = (value) => (value == null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("es-AR")} %`);
const argentinaToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const MISSING = /ml_competitor|ml_trends|does not exist|schema cache/i;

async function readAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function callMl(body, session) {
  const response = await adminFetch({ action: "mercadolibre", ...body }, session?.access_token);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json;
}

function useCompetitionData(supabase, reload) {
  const [state, setState] = useState({ status: "loading", competitors: [], snapshots: [], trends: [] });
  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      readAll(() => supabase.from("ml_competitor_items").select("*").order("id")),
      readAll(() => supabase.from("ml_competitor_snapshots").select("item_id,taken_on,price,sold_quantity").gte("taken_on", since).order("item_id")),
      readAll(() => supabase.from("ml_trends").select("category_id,taken_on,category_name,path,keywords").gte("taken_on", since).order("category_id")),
    ])
      .then(([competitors, snapshots, trends]) => { if (alive) setState({ status: "ready", competitors, snapshots, trends }); })
      .catch((error) => { if (alive) setState({ status: MISSING.test(String(error?.message || "")) ? "missing" : "error", competitors: [], snapshots: [], trends: [] }); });
    return () => { alive = false; };
  }, [supabase, reload]);
  return state;
}

const Missing = () => <p className="muted">Falta un paso: pegar el SQL de docs/SQL_PENDIENTE_2026-10-23.md en Supabase (SQL Editor → Run).</p>;

export function MlCompetition({ supabase, session, isAdmin, items = [], nickname = {} }) {
  const [reload, setReload] = useState(0);
  const data = useCompetitionData(supabase, reload);
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [ourItem, setOurItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const today = argentinaToday();
  const ours = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const rows = useMemo(() => competitionRows({ competitors: data.competitors, snapshots: data.snapshots, ours, today }), [data, ours, today]);
  const summary = useMemo(() => competitorSummary(rows), [rows]);

  async function run(body, done) {
    setBusy(true); setMessage("");
    try { const result = await callMl(body, session); setMessage(done(result)); setReload((value) => value + 1); } catch (error) { setMessage(error.message); }
    setBusy(false);
  }

  if (data.status === "loading") return <p className="muted" role="status">Cargando la competencia…</p>;
  if (data.status === "missing") return <Missing />;
  if (data.status === "error") return <p className="muted">No se pudo leer la competencia.</p>;
  return (
    <div className="content-stack">
      {isAdmin && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Seguimiento diario</span><h2>Sumar publicaciones de la competencia</h2>
            <p className="muted small">Pegá links de publicaciones (o códigos MLA…), uno o varios. Cada día se guarda su precio y cuántas vendieron. Opcional: de quién son y cuál es la nuestra que compite (link o MLA).</p></div></div>
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="https://articulo.mercadolibre.com.ar/MLA-…" aria-label="Links de la competencia" />
          <div className="ml-competition-form">
            <input value={who} onChange={(event) => setWho(event.target.value)} placeholder="Competidor (ej. Alkanos)" aria-label="Competidor" />
            <input value={ourItem} onChange={(event) => setOurItem(event.target.value)} placeholder="Nuestra publicación (link o MLA, opcional)" aria-label="Nuestra publicación" />
          </div>
          <div className="panel-head-actions">
            <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => run({ op: "competitors-add", text, competitorName: who, ourItemId: ourItem }, (result) => { setText(""); return `Listo: ${result.saved} publicaciones en seguimiento${result.missing?.length ? `; no se encontraron ${result.missing.length}` : ""}${result.products ? `; ${result.products} links de catálogo no sirven (pegá el de la publicación)` : ""}.`; })}>Sumar</button>
            <button type="button" className="secondary" disabled={busy || !rows.length} onClick={() => run({ op: "competitors-refresh" }, (result) => `Precios al día: ${result.saved} publicaciones.`)}>Actualizar ahora</button>
          </div>
          {message && <p className="muted small" role="status">{message}</p>}
        </section>
      )}
      {summary.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Por competidor</h2><p className="muted small">Vendidas en 30 días = diferencia entre la foto de hoy y la de hace 30 días (se completa con los días de seguimiento; Mercado Libre puede redondear las vendidas de otros).</p></div></div>
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Competidor</th><th>Publicaciones</th><th>Vendidas ~30 días</th><th>Más baratos que nosotros</th></tr></thead>
            <tbody>{summary.map((entry) => <tr key={entry.who}><td><strong>{entry.who}</strong></td><td>{entry.items}</td><td>{entry.sold30}</td><td>{entry.linked ? `${entry.cheaper} de ${entry.linked} vinculadas` : "—"}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head"><div><h2>Publicaciones en seguimiento ({rows.length})</h2></div></div>
        {rows.length === 0 ? <p className="muted">{isAdmin ? "Todavía no hay: pegá links arriba." : "Todavía no hay: las carga Felipe."}</p> : (
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Publicación</th><th>Precio</th><th>7 días</th><th>30 días</th><th>Vendidas 7 / 30 días</th><th>La nuestra</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.item.id}>
                <td><a href={row.item.permalink} target="_blank" rel="noreferrer">{String(row.item.title).slice(0, 60)} <ExternalLink size={11} /></a><div className="muted small">{row.who}{row.item.free_shipping ? " · envío gratis" : ""}{row.item.status && row.item.status !== "active" ? ` · ${row.item.status}` : ""} · seguida desde {row.since ? row.since.split("-").reverse().join("/") : "hoy"}</div></td>
                <td>{money(row.item.price)}{row.item.original_price ? <div className="muted small">antes {money(row.item.original_price)}</div> : null}</td>
                <td>{signed(row.priceChange7)}</td>
                <td>{signed(row.priceChange30)}</td>
                <td>{row.sold7 ?? "—"} / {row.sold30 ?? "—"}<div className="muted small">total {row.item.sold_quantity ?? "—"}</div></td>
                <td>{row.our ? <>{money(row.our.price)}<div className="muted small">{row.vsOur == null ? "" : row.vsOur > 0 ? `${row.vsOur} % más cara` : row.vsOur < 0 ? `${Math.abs(row.vsOur)} % más barata` : "mismo precio"} · {nickname[row.our.seller_id] || ""}</div></> : <span className="muted small">sin vincular</span>}</td>
                {isAdmin && <td><button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm("¿Dejar de seguir esta publicación?")) run({ op: "competitors-remove", id: row.item.id }, () => "Quitada."); }}>Quitar</button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

export function MlTrends({ supabase, session, isAdmin, items = [] }) {
  const [reload, setReload] = useState(0);
  const data = useCompetitionData(supabase, reload);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const view = useMemo(() => trendsView(data.trends, items.filter((item) => item.status === "active").map((item) => item.title)), [data.trends, items]);
  if (data.status === "loading") return <p className="muted" role="status">Cargando tendencias…</p>;
  if (data.status === "missing") return <Missing />;
  if (data.status === "error") return <p className="muted">No se pudieron leer las tendencias.</p>;
  async function refresh() {
    setBusy(true); setMessage("");
    try { const result = await callMl({ op: "trends-refresh" }, session); setMessage(`Tendencias de ${result.saved} categorías.${result.errors?.length ? ` Faltó: ${result.errors.slice(0, 2).join(" · ")}` : ""}`); setReload((value) => value + 1); } catch (error) { setMessage(error.message); }
    setBusy(false);
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Lo más buscado en Mercado Libre</span><h2>Tendencias de nuestras categorías</h2>
          <p className="muted small">Las búsquedas que más crecen en las categorías donde más vendemos (se actualiza solo cada día). En naranja: ninguna publicación nuestra las nombra en el título; puede ser un producto o un título para sumar.</p></div>
        {isAdmin && <button type="button" className="secondary" disabled={busy} onClick={refresh}>Actualizar ahora</button>}
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      <label className="small"><input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} /> Solo las que no cubrimos</label>
      {view.length === 0 ? <p className="muted">Todavía no hay tendencias: se traen solas cada día{isAdmin ? " o con \"Actualizar ahora\"" : ""}.</p> : view.map((row) => {
        const keywords = row.keywords.filter((trend) => !onlyOpen || !trend.covered);
        return (
          <div key={row.category_id} className="ml-trend">
            <h3>{row.category_name || row.category_id} <span className="muted small">{row.path}</span></h3>
            {keywords.length === 0 ? <p className="muted small">Cubrimos todas.</p> : (
              <div className="ml-trend-words">{keywords.map((trend) => <a key={trend.keyword} href={trend.url} target="_blank" rel="noreferrer" className={trend.covered ? "badge" : "badge warn"}>{trend.rank}. {trend.keyword}</a>)}</div>
            )}
          </div>
        );
      })}
    </section>
  );
}
