import { useEffect, useMemo, useState } from "react";
import { barWidths, catalogIndex, LEVELS, MEASURES, PERIODS, rankingCsv, rankItems, sinceDate, weeklySeries } from "./product-ranking.mjs";
import { adminFetch } from "./admin-api.mjs";

// 27/11: Ranking de ventas (Contabilium) dentro de Productos. FC y COT suman; NC y NCT restan.
// Los renglones los trae el servidor de madrugada (lib/contabilium-items.mjs → contabilium_items).
const SHOWN = 15;
const PAGE = 1000;
const money = (value) => `$ ${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;
const units = (value) => `${(Number(value) || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })} u.`;
const COMPANIES = ["POLIPLAST", "POLIOCHO", "FOAMFACTORY", "COMARG"];

async function loadAll(query) {
  const rows = [];
  for (let from = 0; from < 60000; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadRanking(supabase, now = Date.now()) {
  const since = sinceDate(370, now);
  const items = await loadAll(() => supabase.from("contabilium_items").select("company,fecha,signo,codigo,nombre,cantidad,neto,neto_usd,rubro,subrubro").gte("fecha", since).order("fecha", { ascending: false }));
  let catalog = [];
  try {
    const [variants, products] = await Promise.all([
      loadAll(() => supabase.from("catalog_variants").select("sku,product_id")),
      loadAll(() => supabase.from("catalog_products").select("id,name,family,subfamily")),
    ]);
    const byId = new Map(products.map((product) => [product.id, product]));
    catalog = variants.filter((variant) => variant.sku).map((variant) => {
      const product = byId.get(variant.product_id) || {};
      return { sku: variant.sku, name: product.name, family: product.family, subfamily: product.subfamily };
    });
  } catch { /* sin catálogo: el rubro sale solo de Contabilium */ }
  return { items, catalog };
}

function download(text, name) {
  const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function SyncButton({ onDone }) {
  const [state, setState] = useState({ busy: false, text: "" });
  const run = async () => {
    setState({ busy: true, text: "Leyendo renglones en Contabilium…" });
    const parts = [];
    for (const company of COMPANIES) {
      try {
        const response = await adminFetch({ action: "contabilium-items", op: "sync", company });
        const body = await response.json().catch(() => ({}));
        parts.push(body.error ? `${company}: ${body.error}` : `${company}: ${body.read || 0} leídos${body.pending ? `, faltan ${body.pending}` : ""}${body.lastError ? ` (${body.lastError})` : ""}`);
      } catch (error) {
        parts.push(`${company}: ${error.message}`);
      }
    }
    setState({ busy: false, text: parts.join(" · ") });
    onDone?.();
  };
  return <p className="small"><button type="button" className="secondary" disabled={state.busy} onClick={run}>{state.busy ? "Leyendo…" : "Traer renglones ahora"}</button> <span className="muted">{state.text}</span></p>;
}

function WeeklyChart({ items, rowKey, level, days, company, catalog, label, onClose }) {
  const [metric, setMetric] = useState("usd");
  const series = useMemo(() => weeklySeries(items, { key: rowKey, level, days, company, catalog }), [items, rowKey, level, days, company, catalog]);
  const values = series.rows.map((row) => (metric === "units" ? row.units : row.usd));
  const max = Math.max(0, ...values);
  const fmtWeek = (week) => `${week.slice(8, 10)}/${week.slice(5, 7)}`;
  return (
    <section className="ranking-weekly" aria-label={`Semanas de ${label}`}>
      <div className="ranking-weekly-head">
        <strong>{label}</strong>
        <div className="segmented" role="tablist" aria-label="Medida del gráfico">
          <button type="button" role="tab" aria-selected={metric === "usd"} className={metric === "usd" ? "selected" : ""} onClick={() => setMetric("usd")}>USD</button>
          <button type="button" role="tab" aria-selected={metric === "units"} className={metric === "units" ? "selected" : ""} onClick={() => setMetric("units")}>Unidades</button>
        </div>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <div className="ranking-weeks" role="img" aria-label="Ventas por semana">
        {series.rows.map((row, index) => (
          <div key={row.week} className="ranking-week" title={`Semana del ${fmtWeek(row.week)}: ${money(row.usd)} · ${units(row.units)}`}>
            <i style={{ height: `${max > 0 && values[index] > 0 ? Math.max(3, (values[index] / max) * 100) : 0}%` }} />
            <span>{fmtWeek(row.week)}</span>
          </div>
        ))}
      </div>
      {series.byCompany.length > 1 && <p className="muted small">Por razón social: {series.byCompany.map((row) => `${row.name} ${money(row.usd)}`).join(" · ")}</p>}
    </section>
  );
}

export function ProductRanking({ supabase, isAdmin = false }) {
  const [state, setState] = useState({ status: "loading", items: [], catalog: [] });
  const [reload, setReload] = useState(0);
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState(null);
  const [level, setLevel] = useState("producto");
  const [measure, setMeasure] = useState("usd");
  const [company, setCompany] = useState("");
  const [rubro, setRubro] = useState("");
  const [subrubro, setSubrubro] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!supabase?.from) { setState({ status: "offline", items: [], catalog: [] }); return undefined; }
    let alive = true;
    loadRanking(supabase)
      .then((data) => { if (alive) setState({ status: "ready", ...data }); })
      .catch((error) => {
        if (!alive) return;
        const missing = /contabilium_items|does not exist|PGRST205|42P01/i.test(`${error?.code || ""} ${error?.message || ""}`);
        setState({ status: missing ? "missing" : "error", items: [], catalog: [] });
      });
    return () => { alive = false; };
  }, [supabase, reload]);

  const index = useMemo(() => catalogIndex(state.catalog), [state.catalog]);
  const result = useMemo(() => rankItems(state.items, { days, level, measure, company, rubro, subrubro, query, catalog: index }), [state.items, days, level, measure, company, rubro, subrubro, query, index]);
  const shown = showAll ? result.rows : result.rows.slice(0, SHOWN);
  const widths = useMemo(() => barWidths(shown, measure), [shown, measure]);
  const fmt = measure === "unidades" ? units : money;

  if (state.status === "loading") return <div className="ml-skeleton" role="status" aria-label="Cargando"><i /><i /><i /></div>;
  if (state.status === "offline") return <section className="panel"><p className="muted">El ranking necesita la cuenta en línea.</p></section>;
  if (state.status === "missing" || state.status === "error") return (
    <section className="panel">
      <p className="muted">{state.status === "missing" ? "Todavía no está la tabla de renglones de Contabilium (falta aplicar la migración contabilium_items)." : "No se pudieron leer las ventas. Probá de nuevo en un rato."}</p>
    </section>
  );

  const periodLabel = PERIODS.find(([value]) => value === days)?.[1] || "";
  return (
    <section className="panel ranking">
      <div className="panel-head"><div><span className="eyebrow">Ventas de Contabilium</span><h2>Ranking de {LEVELS.find(([key]) => key === level)?.[1].toLowerCase()}</h2>
        <p className="muted small">Todas las razones sociales (POLIPLAST, POLIOCHO, FOAMFACTORY, COMARG). Facturas (FC) y cotizaciones (COT) suman; notas de crédito (NC y NCT) restan. En dólares, sin IVA: cada venta en pesos se divide por el dólar del día en que se facturó. Por ahora sin las ventas facturadas desde Mercado Libre (se suman en el próximo paso). {periodLabel}: {money(result.totalNet)} · {units(result.totalUnits)}.{result.noUsd ? ` ${result.noUsd} renglones todavía sin el dólar calculado.` : ""}</p></div></div>
      {isAdmin && <SyncButton onDone={() => setReload((value) => value + 1)} />}
      {state.items.length === 0 ? <p className="muted">Todavía no hay renglones leídos de Contabilium. Se traen solos de madrugada{isAdmin ? " o con «Traer renglones ahora»" : ""}.</p> : <>
        <div className="ranking-filters">
          <div className="segmented" role="tablist" aria-label="Período">
            {PERIODS.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={days === value} className={days === value ? "selected" : ""} onClick={() => setDays(value)}>{label}</button>)}
          </div>
          <div className="segmented" role="tablist" aria-label="Qué se ordena">
            {LEVELS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={level === key} className={level === key ? "selected" : ""} onClick={() => setLevel(key)}>{label}</button>)}
          </div>
          <div className="segmented" role="tablist" aria-label="Medida">
            {MEASURES.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={measure === key} className={measure === key ? "selected" : ""} onClick={() => setMeasure(key)}>{label}</button>)}
          </div>
        </div>
        <div className="ranking-filters">
          <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Razón social"><option value="">Todas las razones sociales</option>{result.options.companies.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={rubro} onChange={(event) => { setRubro(event.target.value); setSubrubro(""); }} aria-label="Rubro"><option value="">Todos los rubros</option>{result.options.rubros.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={subrubro} onChange={(event) => setSubrubro(event.target.value)} aria-label="Subrubro"><option value="">Todos los subrubros</option>{result.options.subrubros.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar SKU o producto" aria-label="Buscar en el ranking" />
        </div>
        {result.rows.length === 0 ? <p className="muted">No hay ventas con ese filtro en el período.</p> : <>
          <ol className="ranking-bars" aria-label={`Ranking por ${measure === "unidades" ? "unidades" : "facturado"}`}>
            {shown.map((row, position) => (
              <li key={row.key} className={`ranking-bar${open === row.key ? " is-open" : ""}`} role="button" tabIndex={0} onClick={() => setOpen(open === row.key ? null : row.key)} onKeyDown={(event) => { if (event.key === "Enter") setOpen(open === row.key ? null : row.key); }} title={`${row.label}: ${money(row.net)} · ${units(row.units)}${row.credits ? ` · ${row.credits} nota(s) de crédito` : ""}`}>
                <span className="ranking-pos">{row.rank}</span>
                <span className="ranking-name"><strong>{row.label}</strong>{level === "producto" && <span className="muted small"> {row.sku}{row.rubro ? ` · ${row.rubro}` : ""}</span>}{level === "subrubro" && <span className="muted small"> {row.rubro}</span>}</span>
                <span className="ranking-track" aria-hidden="true"><i style={{ width: `${widths[position]}%` }} /></span>
                <span className="ranking-value">{fmt(measure === "unidades" ? row.units : row.net)} <span className="muted small">{Math.round(row.share * 1000) / 10}%</span></span>
              </li>
            ))}
          </ol>
          {open && <WeeklyChart items={state.items} rowKey={open} level={level} days={days} company={company} catalog={index} label={result.rows.find((row) => row.key === open)?.label || ""} onClose={() => setOpen(null)} />}
          <p className="small">
            {result.rows.length > SHOWN && <button type="button" className="secondary" onClick={() => setShowAll(!showAll)}>{showAll ? `Ver solo los ${SHOWN} primeros` : `Ver los ${result.rows.length}`}</button>}{" "}
            <button type="button" className="secondary" onClick={() => download(rankingCsv(result.rows, level), `ranking-${level}-${days}d.csv`)}>Descargar CSV</button>
          </p>
        </>}
      </>}
    </section>
  );
}
