import { AccountTag } from "./MlAccountTag.jsx";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { competitionCsv, competitionRows, competitorSummary, trendsView } from "./ml-competition-view.mjs";
import { catalogView } from "./ml-catalog-view.mjs";

// Ventas → Mercado Libre → "Competencia" y "Tendencias" (23/10). Felipe pega links de publicaciones de la
// competencia; cada día se guarda su precio y vendidas para ver cuánto venden y cómo mueven el precio, contra
// nuestra publicación vinculada. Tendencias: lo más buscado en nuestras categorías. Solo lee Mercado Libre.
const money = (value) => (typeof value === "number" ? `$ ${Math.round(value).toLocaleString("es-AR")}` : "—");
const signed = (value) => (value == null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("es-AR")} %`);
const argentinaToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const MISSING = /ml_competitor|ml_trends|ml_catalog_status|does not exist|schema cache/i;

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

function downloadCsv(rows) {
  const url = URL.createObjectURL(new Blob([competitionCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `competencia-ml-${argentinaToday()}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
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
      // Sin la tabla nueva (SQL de docs/SQL_PENDIENTE_CATALOGO_2026-10-23.md) lo demás sigue andando.
      readAll(() => supabase.from("ml_catalog_status").select("*").order("item_id")).catch((error) => (MISSING.test(String(error?.message || "")) ? null : [])),
    ])
      .then(([competitors, snapshots, trends, catalog]) => { if (alive) setState({ status: "ready", competitors, snapshots, trends, catalog }); })
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
  const [probe, setProbe] = useState(null);
  const today = argentinaToday();
  const ours = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const rows = useMemo(() => competitionRows({ competitors: data.competitors, snapshots: data.snapshots, ours, today }), [data, ours, today]);
  const summary = useMemo(() => competitorSummary(rows), [rows]);
  const catalog = useMemo(() => catalogView(data.catalog || [], { nickname }), [data.catalog, nickname]);
  const sellers = useMemo(() => [...new Set(items.map((item) => String(item.seller_id || "")).filter(Boolean))], [items]);

  // Recorre las cuentas por tandas (cada pedido menos de 60 s) hasta revisar todas las publicaciones de catálogo.
  async function refreshCatalog() {
    setBusy(true); setMessage("");
    const parts = [];
    try {
      for (const sellerId of sellers) {
        const name = nickname[sellerId] || sellerId;
        let offset = 0;
        let last = null;
        for (let guard = 0; guard < 60; guard += 1) {
          setMessage(`${name}: revisando publicaciones de catálogo${last ? ` ${last.next} de ${last.total}` : ""}…`);
          last = await callMl({ op: "catalog-refresh", sellerId, offset }, session);
          offset = last.next;
          if (last.done || !last.total) break;
        }
        parts.push(`${name} ${last?.total || 0}`);
      }
      setMessage(`Listo: publicaciones de catálogo revisadas (${parts.join(", ")}).`);
    } catch (error) {
      setMessage(MISSING.test(error.message) ? "Falta un paso: pegar el SQL de docs/SQL_PENDIENTE_CATALOGO_2026-10-23.md en Supabase (SQL Editor → Run)." : error.message);
    }
    setReload((value) => value + 1);
    setBusy(false);
  }

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
        <section className="panel ml-competition-add">
          <div className="panel-head"><div><span className="eyebrow">Seguimiento diario</span><h2>Competencia en Mercado Libre</h2>
            <p className="muted small">Mercado Libre no deja a nuestra app buscar ni leer publicaciones de otros vendedores (lo confirmó el diagnóstico: responde 403). Lo que sí deja es ver, en nuestras publicaciones de catálogo, quién más vende el mismo producto, a qué precio, quién gana y cuánto habría que bajar para ganar. Se revisa solo todos los días; con el botón, ahora. Es la competencia dentro de Mercado Libre; la de ventas directas sigue en Academia → Competencia.</p></div></div>
          <div className="panel-head-actions">
            <button type="button" className="primary" disabled={busy || !sellers.length} onClick={refreshCatalog}>Traer competencia del catálogo</button>
            <button type="button" className="secondary" disabled={busy} title="Prueba qué deja leer Mercado Libre a nuestra app y muestra el resultado de cada prueba" onClick={() => run({ op: "competitors-probe" }, (result) => { setProbe(result.results || []); return "Diagnóstico listo (abajo)."; })}>Probar qué deja Mercado Libre</button>
            <button type="button" className="secondary" disabled={!rows.length} onClick={() => downloadCsv(rows)}>Descargar CSV</button>
          </div>
          <details className="small">
            <summary>Pegar links de publicaciones (Mercado Libre hoy lo bloquea)</summary>
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="https://articulo.mercadolibre.com.ar/MLA-…" aria-label="Links de la competencia" />
          <div className="ml-competition-form">
            <input value={who} onChange={(event) => setWho(event.target.value)} placeholder="Vendedor en ML (si lo dejás vacío, se usa su apodo)" aria-label="Vendedor competidor en Mercado Libre" />
            <input value={ourItem} onChange={(event) => setOurItem(event.target.value)} placeholder="Nuestra publicación (link o MLA, opcional)" aria-label="Nuestra publicación" />
          </div>
          <div className="panel-head-actions">
            <button type="button" className="secondary" disabled={busy || !text.trim()} onClick={() => run({ op: "competitors-add", text, competitorName: who, ourItemId: ourItem }, (result) => { setText(""); if (result.blocked && !result.saved) return "Mercado Libre no deja a nuestra app leer publicaciones de otros vendedores (respondió 403). No es un error del CRM: usá los reportes de Métricas → Competencia (Más → Datos → Mercado Libre)."; return `Listo: ${result.saved} publicaciones en seguimiento${result.missing?.length ? `; no se encontraron ${result.missing.length}` : ""}${result.products ? `; ${result.products} links de catálogo no sirven (pegá el de la publicación)` : ""}.`; })}>Sumar</button>
          </div>
          </details>
          {message && <p className="muted small" role="status">{message}</p>}
          {probe && (
            <div className="table-scroll"><table className="sales-history-table" aria-label="Diagnóstico de la búsqueda">
              <thead><tr><th>Prueba</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>{probe.map((test) => <tr key={test.name}><td>{test.name}</td><td>{test.ok ? "✅" : "❌"} {test.status || "—"}</td><td className="small">{test.detail}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      )}
      <CatalogPanel catalog={catalog} missing={data.catalog === null} isAdmin={isAdmin} />
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
            <thead><tr><th>Publicación</th><th>Precio</th><th>24 h</th><th>7 días</th><th>30 días</th><th>Vendidas 7 / 30 días</th><th>La nuestra</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.item.id}>
                <td><a href={row.item.permalink} target="_blank" rel="noreferrer">{String(row.item.title).slice(0, 60)} <ExternalLink size={11} /></a><div className="muted small">{row.who}{row.item.free_shipping ? " · envío gratis" : ""}{row.item.status && row.item.status !== "active" ? ` · ${row.item.status}` : ""} · seguida desde {row.since ? row.since.split("-").reverse().join("/") : "hoy"}</div></td>
                <td>{money(row.item.price)}{row.item.original_price ? <div className="muted small">antes {money(row.item.original_price)}</div> : null}</td>
                <td>{signed(row.priceChange1)}<div className="muted small">{row.sold1 == null ? "" : `${row.sold1} vendidas`}</div>{row.alerts.map((alert) => <div key={alert.kind} className={alert.kind === "precio" ? "badge warn" : "badge"} title={alert.text}>{alert.kind === "precio" ? "🔴" : "🟢"} {alert.text}</div>)}</td>
                <td>{signed(row.priceChange7)}</td>
                <td>{signed(row.priceChange30)}</td>
                <td>{row.sold7 ?? "—"} / {row.sold30 ?? "—"}<div className="muted small">total {row.item.sold_quantity ?? "—"}</div></td>
                <td>{row.our ? <>{money(row.our.price)}<div className="muted small">{row.vsOur == null ? "" : row.vsOur > 0 ? `${row.vsOur} % más cara` : row.vsOur < 0 ? `${Math.abs(row.vsOur)} % más barata` : "mismo precio"} · <AccountTag name={nickname[row.our.seller_id] || "cuenta"} /></div></> : <span className="muted small">sin vincular</span>}</td>
                {isAdmin && <td><button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm("¿Dejar de seguir esta publicación?")) run({ op: "competitors-remove", id: row.item.id }, () => "Quitada."); }}>Quitar</button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

const STATE_CLASS = { bad: "badge bad", warn: "badge warn", good: "badge ok", muted: "badge" };

function CatalogPanel({ catalog, missing, isAdmin }) {
  const [onlyLosing, setOnlyLosing] = useState(true);
  if (missing) return isAdmin ? <section className="panel"><h2>Catálogo: quién gana</h2><p className="muted">Falta un paso: pegar el SQL de docs/SQL_PENDIENTE_CATALOGO_2026-10-23.md en Supabase (SQL Editor → Run).</p></section> : null;
  const { rows, counts } = catalog;
  const shown = onlyLosing ? rows.filter((row) => row.state.order <= 1) : rows;
  return (
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Publicaciones de catálogo</span><h2>Catálogo: quién gana</h2>
        <p className="muted small">En el catálogo varios vendedores compiten en la misma página de producto y Mercado Libre muestra a uno solo arriba (el que "gana"). Dato de Mercado Libre, se revisa una vez por día.</p></div></div>
      {counts.total === 0 ? <p className="muted">Todavía no hay datos{isAdmin ? ': tocá "Traer competencia del catálogo".' : "."}</p> : (
        <>
          <div className="ml-catalog-counts">
            <div><strong>{counts.total}</strong><span>en catálogo</span></div>
            <div className="bad"><strong>{counts.losing}</strong><span>perdemos</span></div>
            <div className="warn"><strong>{counts.sharing}</strong><span>compartimos</span></div>
            <div className="good"><strong>{counts.winning}</strong><span>ganamos</span></div>
            {counts.alone > 0 && <div><strong>{counts.alone}</strong><span>sin competencia</span></div>}
          </div>
          <label className="small"><input type="checkbox" checked={onlyLosing} onChange={(event) => setOnlyLosing(event.target.checked)} /> Solo las que perdemos o compartimos</label>
          {shown.length === 0 ? <p className="muted small">Ganamos en todas. 🎉</p> : (
            <div className="table-scroll"><table className="sales-history-table">
              <thead><tr><th>Producto</th><th>Estado</th><th>Nuestro precio</th><th>Precio para ganar</th><th>Quién gana</th><th>Más barato de otro</th><th>Otros vendedores</th></tr></thead>
              <tbody>{shown.map((row) => (
                <tr key={row.item_id}>
                  <td><a href={row.permalink} target="_blank" rel="noreferrer">{String(row.product_name).slice(0, 60)} <ExternalLink size={11} /></a><div className="muted small">{row.account ? <AccountTag name={row.account} /> : null} {row.item_id}</div></td>
                  <td><span className={STATE_CLASS[row.state.tone]}>{row.state.label}</span></td>
                  <td>{money(row.our_price == null ? null : Number(row.our_price))}</td>
                  <td>{money(row.price_to_win == null ? null : Number(row.price_to_win))}{row.cut ? <div className="muted small">bajar {money(row.cut.amount)} ({Math.abs(row.cut.pct).toLocaleString("es-AR")} %)</div> : null}</td>
                  <td>{row.winner || "—"}{row.winner_price != null ? <div className="muted small">{money(Number(row.winner_price))}</div> : null}</td>
                  <td>{money(row.cheapest_price == null ? null : Number(row.cheapest_price))}{row.vsCheapest != null && row.vsCheapest !== 0 ? <div className="muted small">{row.vsCheapest > 0 ? `estamos ${row.vsCheapest.toLocaleString("es-AR")} % arriba` : `estamos ${Math.abs(row.vsCheapest).toLocaleString("es-AR")} % abajo`}</div> : null}</td>
                  <td>{row.others_count ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </section>
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
