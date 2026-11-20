import { useEffect, useMemo, useState } from "react";
import { AccountTag } from "./MlAccountTag";
import { filterHub, HUB_FILTERS, listingLabel } from "./product-hub.mjs";
import { loadProductHub } from "./product-hub-data.js";

// 20/11: Productos = una ficha por SKU que junta cotizador, Mercado Libre y Shopify, con dónde conviene venderlo
// y avisos (⚠ precio raro, catálogo perdido, calidad, tendencia). Solo mira: no cambia nada en ningún canal.
const money = (value) => (value == null ? "—" : `$\u00a0${Number(value).toLocaleString("es-AR")}`);
const PAGE = 40;

function Photo({ url, name }) {
  return /^https:\/\//.test(url || "") ? <img className="ph-photo" src={url} alt="" loading="lazy" /> : <span className="ph-photo ph-photo-empty" aria-label={`Sin foto: ${name}`}>sin foto</span>;
}

function Detail({ row }) {
  return (
    <div className="ph-detail">
      {row.advice.length > 0 && <ul className="ph-advice">{row.advice.map((line) => <li key={line}>{line}</li>)}</ul>}
      <h4>Lo que queda por unidad en cada canal</h4>
      {row.channels.length === 0 ? <p className="muted small">Sin precios para comparar todavía.</p> : (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Canal</th><th>Precio</th><th>Queda</th><th>Detalle</th></tr></thead>
          <tbody>{row.channels.map((channel) => (
            <tr key={channel.key} className={row.best?.key === channel.key ? "ph-best" : ""}>
              <td data-label="Canal">{channel.label}{row.best?.key === channel.key && <strong className="ph-best-tag"> · deja más</strong>}</td>
              <td data-label="Precio">{money(channel.price)}</td>
              <td data-label="Queda">{money(channel.net)}</td>
              <td data-label="Detalle" className="muted small">{channel.note}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {row.ml.length > 0 && <>
        <h4>Publicaciones activas en Mercado Libre</h4>
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Cuenta</th><th>Tipo</th><th>Precio</th><th>Vendidas 30 d</th><th>Visitas 30 d</th><th>Calidad</th><th>Catálogo</th><th>Preguntas</th></tr></thead>
          <tbody>{row.ml.map((listing) => (
            <tr key={listing.id}>
              <td data-label="Cuenta"><AccountTag name={listing.account} /><br /><a className="small" href={listing.permalink} target="_blank" rel="noreferrer">{listing.id}</a></td>
              <td data-label="Tipo">{listingLabel(listing.type)}</td>
              <td data-label="Precio">{money(listing.price)}</td>
              <td data-label="Vendidas 30 d">{listing.units30}{listing.stock === 0 ? <span className="badge danger"> sin stock</span> : null}</td>
              <td data-label="Visitas 30 d">{listing.visits30}{listing.rising ? <span className="ph-up" title="Visitas en alza esta semana"> ↑</span> : null}</td>
              <td data-label="Calidad">{listing.quality || "sin revisar"}{listing.px === "red" ? " · experiencia en rojo" : ""}</td>
              <td data-label="Catálogo">{listing.catalog ? (listing.catalog.winning ? "ganando" : `perdiendo${listing.catalog.priceToWin ? ` (ganar: ${money(listing.catalog.priceToWin)})` : ""}`) : "—"}</td>
              <td data-label="Preguntas">{listing.questions}</td>
            </tr>))}</tbody>
        </table></div>
      </>}
      {row.shopify.length > 0 && <p className="small">Shopify: {row.shopify.map((variant) => `${variant.title} ${money(variant.price)}${variant.compareAt ? ` (tachado ${money(variant.compareAt)})` : ""}${variant.active ? "" : " · no activo"}`).join(" · ")}</p>}
      {row.alerts.length > 0 && <ul className="ph-alerts">{row.alerts.map((alert) => <li key={alert.text} className={`ph-alert ph-${alert.level}`}>{alert.text}</li>)}</ul>}
    </div>
  );
}

export function ProductHub({ supabase }) {
  const [state, setState] = useState({ status: "loading", rows: [], dollar: null });
  const [filter, setFilter] = useState("todos");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (!supabase?.from) { setState({ status: "offline", rows: [], dollar: null }); return undefined; }
    let alive = true;
    loadProductHub(supabase)
      .then((data) => { if (alive) setState({ status: "ready", ...data }); })
      .catch(() => { if (alive) setState({ status: "error", rows: [], dollar: null }); });
    return () => { alive = false; };
  }, [supabase]);

  const list = useMemo(() => filterHub(state.rows, { filter, query }), [state.rows, filter, query]);
  const counts = useMemo(() => Object.fromEntries(HUB_FILTERS.map(([key]) => [key, filterHub(state.rows, { filter: key }).length])), [state.rows]);
  useEffect(() => { setLimit(PAGE); }, [filter, query]);

  if (state.status === "loading") return <div className="ml-skeleton" role="status" aria-label="Cargando"><i /><i /><i /></div>;
  if (state.status === "offline") return <section className="panel"><p className="muted">Productos necesita la cuenta en línea.</p></section>;
  if (state.status === "error") return <section className="panel"><p className="muted">No se pudieron leer los productos. Probá de nuevo en un rato.</p></section>;

  return (
    <div className="content-stack ml-board product-hub">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Canales online</span><h2>Productos</h2>
          <p className="muted small">Cada SKU con su precio de lista, sus publicaciones de Mercado Libre y Shopify, cuánto queda por unidad en cada canal y qué conviene. {state.dollar ? `Dólar BNA billete vendedor: $ ${state.dollar.rate.toLocaleString("es-AR")}${state.dollar.date ? ` (${state.dollar.date})` : ""}.` : "Sin dólar del día: la lista en USD no se pasa a pesos y no se marca precio raro."} Solo mira: no cambia nada en los canales.</p></div></div>
        <div className="list-toolbar">
          <input type="search" placeholder="Buscar por SKU o nombre" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar producto" />
          <div className="segmented ph-filters" role="tablist" aria-label="Filtro">
            {HUB_FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label} <span className="muted">{counts[key]}</span></button>)}
          </div>
        </div>
        {list.length === 0 ? <p className="muted">No hay productos con ese filtro.</p> : (
          <ul className="ph-list">
            {list.slice(0, limit).map((row) => {
              const warn = row.alerts.find((alert) => alert.key === "precio-raro");
              const isOpen = open === row.sku;
              return (
                <li key={row.sku} className={`ph-row${isOpen ? " open" : ""}`}>
                  <button type="button" className="ph-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : row.sku)}>
                    <Photo url={row.photo} name={row.name} />
                    <span className="ph-main">
                      <strong>{row.name}</strong>
                      <span className="muted small">{row.sku}{row.list ? ` · lista ${row.list.currency} ${row.list.gross.toLocaleString("es-AR")}${row.list.ars ? ` (${money(row.list.ars)})` : ""}` : " · no está en el cotizador"}</span>
                      <span className="ph-chips">
                        {warn && <span className="badge danger" title={warn.text}>⚠ Precio raro</span>}
                        {row.best && <span className="badge">Deja más: {row.best.label}</span>}
                        {row.ml.some((listing) => listing.trend) && <span className="badge ph-trend">En tendencia</span>}
                        {row.ml.some((listing) => listing.rising) && <span className="badge ph-trend">Visitas en alza</span>}
                        {row.alerts.filter((alert) => alert.key !== "precio-raro" && alert.level !== "baja").length > 0 && <span className="badge warn">{row.alerts.filter((alert) => alert.key !== "precio-raro" && alert.level !== "baja").length} aviso(s)</span>}
                      </span>
                    </span>
                    <span className="ph-num"><strong>{row.units30}</strong><small className="muted">vendidas 30 d</small></span>
                  </button>
                  {isOpen && <Detail row={row} />}
                </li>
              );
            })}
          </ul>
        )}
        {list.length > limit && <button type="button" className="secondary" onClick={() => setLimit(limit + PAGE)}>Ver {Math.min(PAGE, list.length - limit)} más (de {list.length})</button>}
      </section>
    </div>
  );
}
