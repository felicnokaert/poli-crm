import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Search } from "lucide-react";
import { adjustCsv, adjustList, contabiliumByCode, countInfo, dosifiedSince, latestCounts, pivotStock, searchStock, stockNow } from "./stock-model.mjs";
import { adminFetch } from "./admin-api.mjs";
import { Pager, usePaged } from "./Pager.jsx";
import { buildSheet, contabiliumIndex, facets, filterSheet, paginate, reviewList, salesIndex, sortSheet } from "./stock-sheet.mjs";

// Stock en una sola hoja (Felipe 27/11): una fila por producto con el último conteo de Villa Domínico y de Mar del Plata
// (app de conteo, tal como se contó) y el stock de Contabilium de cada depósito. Solo lee.
// Ventas: todavía NO se restan (cuando Diego lo defina: FC y COT restan, NC y NCOT suman).
const CONTEO_URL = "https://coldwrbfxpdfutbekysr.supabase.co";
const CONTEO_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGR3cmJmeHBkZnV0YmVreXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjE0MzAsImV4cCI6MjEwMzkzNzQzMH0.7CloDCuNcsm4E3TcEO712RNZdTUvL_BmCrmXWHRRrrc";
const get = async (path) => {
  const response = await fetch(`${CONTEO_URL}/rest/v1/${path}`, { headers: { apikey: CONTEO_ANON, Authorization: `Bearer ${CONTEO_ANON}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
// Catálogo maestro (la limpieza con Diego): todas las variantes activas con su familia y subfamilia, en tandas de 1000.
async function readCatalog(supabase) {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from("catalog_variants").select("sku,name,active,catalog_products(name,family,subfamily)").eq("active", true).range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) out.push({ sku: row.sku, name: row.name || row.catalog_products?.name || row.sku, family: row.catalog_products?.family || "", subfamily: row.catalog_products?.subfamily || "" });
    if (!data || data.length < 1000) break;
  }
  return out;
}
// Ventas por producto (vista del CRM armada desde los renglones de Contabilium). Si todavía no existe, la hoja sigue sin ventas.
async function readSales(supabase) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from("contabilium_ventas_por_codigo").select("codigo,nombre,unidades_6m,unidades_12m,ultima_venta").range(from, from + 999);
    if (error) return null;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out.length ? out : null;
}
const COMPANY = { POLIPLAST: "Poliplast", POLIOCHO: "Poliocho", FOAMFACTORY: "Foam Factory", COMARG: "Comarg" };
const companyName = (key) => COMPANY[key] || key;
const shortDate = (at) => (at ? `${at.slice(8, 10)}/${at.slice(5, 7)}` : "—");
const PAGE = 30;
const BASE_COLUMNS = [["name", "Producto"], ["family", "Familia"], ["companies", "Empresa"], ["vd", "V. Domínico (conteo)"], ["mdq", "MDQ (conteo)"], ["cbVd", "V. Domínico (Contabilium)"], ["cbMdq", "MDQ (Contabilium)"], ["lastAt", "Último conteo"], ["status", "Estado"]];
const SALES_COLUMNS = [["sales12", "Ventas 12 m"], ["lastSale", "Última venta"]];

const qty = (value) => Number(value).toLocaleString("es-AR", { maximumFractionDigits: 1 });
const STATUS = { hay: ["Hay", "ok"], poco: ["Queda poco", "warn"], sin: ["Sin stock", "danger"], "sin-conteo": ["Sin conteo", ""] };

function CountCell({ cell, label }) {
  if (!cell) return <span className="muted" data-label={label}>—</span>;
  const info = countInfo(cell);
  const shown = cell.kgNow != null ? `${qty(cell.kgNow)} kg` : `${qty(cell.count)} ${String(cell.unit || "").toLowerCase()}`;
  return (
    <span data-label={label} className="stock-cell">
      <span>{shown}{cell.kg != null && !/kilo/i.test(cell.unit) ? <span className="muted small"> · {qty(cell.count)} {String(cell.unit || "").toLowerCase()}</span> : null}</span>
      <button type="button" className="stock-info" title={info} aria-label={info}><Info size={14} /></button>
    </span>
  );
}

function CbCell({ value, label, loaded }) {
  return <span data-label={label} className={value == null ? "muted" : ""}>{value == null ? (loaded ? "sin dato" : "—") : qty(value)}</span>;
}

export function StockView({ supabase = null, isAdmin = false }) {
  const [data, setData] = useState(null);
  const [cb, setCb] = useState({ map: new Map(), at: "", loaded: false });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ company: "", family: "", subfamily: "", status: "" });
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState({ rows: [], loaded: false, error: "" });
  const [salesRows, setSalesRows] = useState(null);
  const [view, setView] = useState("hoja");
  const [cbBusy, setCbBusy] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      get("kv_store?select=key,value&key=like.log:*"),
      get("dosif_planillas?select=id,fecha,hora,deposito&order=fecha.desc&limit=500"),
      get("dosif_lineas?select=planilla_id,sku,cantidad,componentes&limit=5000"),
    ]).then(([logs, planillas, lineas]) => {
      if (alive) setData({ rows: stockNow(latestCounts(logs), dosifiedSince(planillas, lineas)) });
    }).catch((error) => { if (alive) setData({ rows: [], error: `No se pudo leer la app de conteo (${error.message}).` }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!supabase?.from) return undefined;
    let alive = true;
    readSales(supabase).then((rows) => { if (alive) setSalesRows(rows); }).catch(() => {});
    readCatalog(supabase).then((rows) => { if (alive) setCatalog({ rows, loaded: true, error: "" }); })
      .catch((error) => { if (alive) setCatalog({ rows: [], loaded: true, error: `No se pudo leer el catálogo (${error.message || error}).` }); });
    return () => { alive = false; };
  }, [supabase]);

  const loadCb = async () => {
    if (!supabase?.from) return;
    try {
      const { data: rows } = await supabase.from("crm_system_status").select("detail,last_run_at").eq("key", "contabilium-stock").limit(1);
      const detail = rows?.[0]?.detail || {};
      setCb({ map: contabiliumByCode(detail), at: rows?.[0]?.last_run_at || "", loaded: Boolean(rows?.[0]), detail });
    } catch { setCb((current) => ({ ...current, loaded: false })); }
  };
  useEffect(() => { loadCb(); }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCb = async () => {
    setCbBusy("Leyendo Contabilium…");
    try {
      for (let round = 0; round < 12; round += 1) {
        const response = await adminFetch({ action: "contabilium", op: "stock", company: "POLIPLAST" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.error) { setCbBusy(`No se pudo: ${body.error || `HTTP ${response.status}`}`); return; }
        setCbBusy(`Leyendo Contabilium… ${body.products || 0} productos`);
        if (body.done) break;
      }
      await loadCb();
      setCbBusy("");
    } catch (error) { setCbBusy(`No se pudo: ${error.message}`); }
  };

  const products = useMemo(() => pivotStock(data?.rows || [], cb.map), [data, cb.map]);
  const cbIndex = useMemo(() => contabiliumIndex(cb.detail || {}), [cb.detail]);
  const sales = useMemo(() => (salesRows ? salesIndex(salesRows) : null), [salesRows]);
  const COLUMNS = sales ? [...BASE_COLUMNS.slice(0, 8), ...SALES_COLUMNS, BASE_COLUMNS[8]] : BASE_COLUMNS;
  const sheet = useMemo(() => buildSheet({ catalog: catalog.rows, products, cb: cbIndex, sales }), [catalog.rows, products, cbIndex, sales]);
  const review = useMemo(() => reviewList(cbIndex, sheet, sales), [cbIndex, sheet, sales]);
  const reviewPaged = usePaged(review, 25, view);
  const facet = useMemo(() => facets(sheet), [sheet]);
  const filtered = useMemo(() => sortSheet(filterSheet(sheet, { query, ...filters }), sort.key, sort.dir), [sheet, query, filters, sort]);
  const paged = paginate(filtered, page, PAGE);
  useEffect(() => { setPage(1); }, [query, filters, sort]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "family" ? { subfamily: "" } : {}) }));
  const sortBy = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  const countedTotal = sheet.filter((row) => row.counted).length;
  const inCatalog = sheet.filter((row) => row.inCatalog).length;
  const adjust = useMemo(() => adjustList(products), [products]);
  const downloadAdjust = () => {
    const url = URL.createObjectURL(new Blob([adjustCsv(adjust.rows)], { type: "text/csv;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `para-ajustar-${new Date().toISOString().slice(0, 10)}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  };
  const cbCompanies = Object.values(cb.detail?.companies || {});
  const cbAt = cbCompanies.map((company) => company.at).filter(Boolean).sort().pop() || "";
  const cbDepotNames = [...new Set(cbCompanies.flatMap((company) => company.allDepots || []))];
  const cbNoDepots = cbCompanies.some((company) => company.at && Array.isArray(company.depots)) && !cbCompanies.some((company) => company.depots?.length);
  const cbHasDepots = [...cb.map.values()].some((item) => item.vd != null || item.mdq != null);

  return (
    <section className="panel stock-view">
      <div className="panel-head">
        <div><span className="eyebrow">Logística</span><h2>Stock</h2></div>
        {isAdmin ? <button type="button" className="secondary" disabled={Boolean(cbBusy) && cbBusy.startsWith("Leyendo")} onClick={refreshCb}>Traer stock de Contabilium</button> : null}
      </div>
      <p className="muted small">Una fila por producto. «Conteo» es lo último que contó cada depósito en la app de conteo, por bulto cerrado, tambor o tira (tocá la «i» para ver quién contó y cuándo). Lo dosificado no se resta: sale de un tambor abierto que no se cuenta. «Contabilium» es el stock que figura allá. Si algo no cierra, avisale a Diego. Puede no coincidir con Contabilium: allá descuenta el depósito que se elige al facturar.</p>
      {cbBusy ? <p className="form-notice">{cbBusy}</p> : null}
      {cb.loaded ? <p className="muted small">{cbHasDepots ? `Stock de Contabilium (Villa Domínico y Mar del Plata, todas las empresas) actualizado ${cbAt ? new Date(cbAt).toLocaleString("es-AR") : ""}: se sincroniza solo 3 veces por día.` : cbNoDepots ? `Contabilium no le muestra los depósitos al usuario de la API${cbDepotNames.length ? ` (ve: ${cbDepotNames.join(", ")})` : ""}: hay que darle acceso a Villa Domínico y Mar del Plata en Contabilium.` : "Contabilium: falta la primera sincronización del stock por depósito (tocá «Traer stock de Contabilium» o esperá la automática)."}</p> : null}
      {cbHasDepots ? (
        <div className="segmented" role="tablist" aria-label="Vista del stock">
          <button type="button" role="tab" aria-selected={view === "hoja"} className={view === "hoja" ? "selected" : ""} onClick={() => setView("hoja")}>Hoja de stock</button>
          <button type="button" role="tab" aria-selected={view === "ajustar"} className={view === "ajustar" ? "selected" : ""} onClick={() => setView("ajustar")}>Para ajustar ({adjust.rows.length})</button>
          <button type="button" role="tab" aria-selected={view === "revisar"} className={view === "revisar" ? "selected" : ""} onClick={() => setView("revisar")}>Revisar ({review.length})</button>
        </div>
      ) : null}
      {cbHasDepots && view === "ajustar" ? (
        <div className="stock-adjust">
          <p className="small">{adjust.pct == null ? "Todavía no hay productos contados que figuren en Contabilium." : <><strong>{adjust.pct} %</strong> de lo contado coincide con Contabilium ({adjust.matching} de {adjust.checked}). Lo contado se pasa a la unidad de Contabilium (tambores × kg, cajas × unidades). Tolerancia: 1 unidad o 2 %.</>}</p>
          {adjust.rows.length ? <button type="button" className="secondary" onClick={downloadAdjust}>Descargar CSV para el ajuste</button> : null}
          {adjust.rows.length === 0 ? <p className="muted">Nada para ajustar.</p> : (
            <div className="stock-table" role="table">
              <div className="stock-row stock-head" role="row"><span>Producto</span><span>Depósito</span><span>Contado</span><span>Contabilium</span><span>Diferencia</span><span>Contó</span></div>
              {adjust.rows.map((row) => (
                <div className="stock-row" role="row" key={`${row.sku}|${row.depot}`}>
                  <span><strong>{row.name}</strong><br /><span className="muted small">{row.sku}</span></span>
                  <span data-label="Depósito">{row.depot}</span>
                  <span data-label="Contado">{row.counted == null ? "—" : qty(row.counted)}</span>
                  <span data-label="Contabilium" style={row.cb < 0 ? { color: "var(--color-danger-text)" } : undefined}>{qty(row.cb)}</span>
                  <span data-label="Diferencia"><span className={`badge ${row.reason === "negativo" ? "danger" : "warn"}`}>{row.diff == null ? "negativo" : `${row.diff > 0 ? "+" : ""}${qty(row.diff)}`}</span></span>
                  <span data-label="Contó" className="muted small">{row.by || "—"}{row.at ? ` · ${row.at.slice(8, 10)}/${row.at.slice(5, 7)}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {cbHasDepots && view === "revisar" ? (
        <div className="stock-adjust">
          <p className="small">Están en Contabilium con stock pero <strong>no</strong> en el catálogo ni en la app de conteo. Puede ser un producto que se nos pasó (hay que sumarlo al catálogo y a la app de conteo) o algo que no es producto o está obsoleto (impuesto, flete, código viejo). {sales ? "Arriba lo que más se vendió en los últimos 12 meses: eso seguro hay que sumarlo." : "Contabilium no manda el nombre por esta vía: buscá el código allá."}</p>
          {review.length === 0 ? <p className="muted">Nada para revisar.</p> : (
            <div className="stock-table" role="table">
              <div className={`stock-row stock-row-review${sales ? " with-sales" : ""} stock-head`} role="row"><span>Código</span><span>Empresa</span><span>V. Domínico</span><span>MDQ</span>{sales ? <><span>Ventas 12 m</span><span>Última venta</span></> : null}</div>
              {reviewPaged.rows.map((row) => (
                <div className={`stock-row stock-row-review${sales ? " with-sales" : ""}`} role="row" key={row.sku}>
                  <span><strong>{row.sku}</strong>{row.name ? <><br /><span className="muted small">{row.name}</span></> : null}</span>
                  <span data-label="Empresa" className="small">{row.companies.map(companyName).join(", ")}</span>
                  <span data-label="V. Domínico" style={row.cbVd < 0 ? { color: "var(--color-danger-text)" } : undefined}>{row.cbVd == null ? "—" : qty(row.cbVd)}</span>
                  <span data-label="MDQ" style={row.cbMdq < 0 ? { color: "var(--color-danger-text)" } : undefined}>{row.cbMdq == null ? "—" : qty(row.cbMdq)}</span>
                  {sales ? <><span data-label="Ventas 12 m">{row.sales12 == null ? "—" : qty(row.sales12)}</span><span data-label="Última venta" className="small">{row.lastSale ? shortDate(row.lastSale) + "/" + row.lastSale.slice(2, 4) : "—"}</span></> : null}
                </div>
              ))}
              <Pager paged={reviewPaged} label="códigos" />
              {review.length > 300 ? <p className="muted small">Se muestran los 300 con más stock (de {review.length}).</p> : null}
            </div>
          )}
        </div>
      ) : null}
      {cbHasDepots && view !== "hoja" ? null : <>
      <p className="muted small">{catalog.loaded ? `${inCatalog} productos del catálogo activo` : "Leyendo el catálogo…"}{countedTotal ? ` · ${countedTotal} con conteo` : ""}{sheet.length - inCatalog > 0 ? ` · ${sheet.length - inCatalog} ${sheet.length - inCatalog === 1 ? "contado que no está" : "contados que no están"} en el catálogo` : ""}.</p>
      {catalog.error ? <p className="form-notice">{catalog.error}</p> : null}
      <div className="list-toolbar stock-filters">
        <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU (ej. 618, iso, balde)" aria-label="Buscar en el stock" /></label>
        <select value={filters.company} onChange={(event) => setFilter("company", event.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{facet.companies.map((key) => <option key={key} value={key}>{companyName(key)}</option>)}</select>
        <select value={filters.family} onChange={(event) => setFilter("family", event.target.value)} aria-label="Familia"><option value="">Todas las familias</option>{facet.families.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        {filters.family && facet.subfamilies(filters.family).length ? <select value={filters.subfamily} onChange={(event) => setFilter("subfamily", event.target.value)} aria-label="Subfamilia"><option value="">Todas las subfamilias</option>{facet.subfamilies(filters.family).map((name) => <option key={name} value={name}>{name}</option>)}</select> : null}
        <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)} aria-label="Estado"><option value="">Todos los estados</option><option value="falta">Sin stock o con poco</option><option value="hay">Hay</option><option value="poco">Queda poco</option><option value="sin">Sin stock</option><option value="sin-conteo">Sin conteo</option>{sales ? <><option value="vende">Con ventas en 12 meses</option><option value="obsoleto">Sin ventas en 12 meses (obsoleto)</option></> : null}</select>
        <select className="stock-sort-select" value={`${sort.key}:${sort.dir}`} onChange={(event) => { const [key, dir] = event.target.value.split(":"); setSort({ key, dir }); }} aria-label="Ordenar por">{COLUMNS.flatMap(([key, label]) => [<option key={`${key}a`} value={`${key}:asc`}>Ordenar: {label} ▲</option>, <option key={`${key}d`} value={`${key}:desc`}>Ordenar: {label} ▼</option>])}</select>
      </div>
      {!data ? <p className="muted">Leyendo los conteos…</p> : data.error ? <p className="form-notice">{data.error}</p> : filtered.length === 0 ? <p className="muted">No hay productos con ese filtro.</p> : (
        <>
        <div className="stock-table" role="table">
          <div className={`stock-row stock-row-sheet${sales ? " with-sales" : ""} stock-head`} role="row">
            {COLUMNS.map(([key, label]) => (
              <span key={key} role="columnheader" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="stock-sort" onClick={() => sortBy(key)}>{label}{sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
              </span>
            ))}
          </div>
          {paged.rows.map((row) => {
            const [label, tone] = STATUS[row.status] || STATUS["sin-conteo"];
            return (
              <div className={`stock-row stock-row-sheet${sales ? " with-sales" : ""}`} role="row" key={row.sku}>
                <span><strong>{row.name}</strong><br /><span className="muted small">{row.sku}</span></span>
                <span data-label="Familia" className="small">{row.family || "—"}{row.subfamily ? <span className="muted"> · {row.subfamily}</span> : null}</span>
                <span data-label="Empresa" className="small">{row.companies.length ? row.companies.map(companyName).join(", ") : <span className="muted">—</span>}</span>
                <CountCell cell={row.vd} label="V. Domínico (conteo)" />
                <CountCell cell={row.mdq} label="MDQ (conteo)" />
                <CbCell value={row.cbVd} label="V. Domínico (Contabilium)" loaded={cb.loaded} />
                <CbCell value={row.cbMdq} label="MDQ (Contabilium)" loaded={cb.loaded} />
                <span data-label="Último conteo" className="small">{shortDate(row.lastAt)}</span>
                {sales ? <span data-label="Ventas 12 m" className={row.sales12 > 0 ? "" : "muted"}>{qty(row.sales12 || 0)}{row.sales6 ? <span className="muted small"> · 6 m: {qty(row.sales6)}</span> : null}</span> : null}
                {sales ? <span data-label="Última venta" className="small">{row.lastSale ? shortDate(row.lastSale) + "/" + row.lastSale.slice(2, 4) : "—"}</span> : null}
                <span data-label="Estado"><span className={`badge ${tone}`}>{label}</span></span>
              </div>
            );
          })}
        </div>
        <div className="stock-pager">
          <button type="button" className="secondary" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /> Anterior</button>
          <span className="small">Página {paged.page} de {paged.pages} · {paged.total} productos</span>
          <button type="button" className="secondary" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)} aria-label="Página siguiente">Siguiente <ChevronRight size={16} /></button>
        </div>
        </>
      )}
      </>}
    </section>
  );
}
