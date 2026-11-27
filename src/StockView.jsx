import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { daysSince, depotLabel, dosifiedSince, isOldDepot, latestCounts, searchStock, stockNow } from "./stock-model.mjs";

// Stock (26/11): lo que contó el depósito en la app de conteo, menos lo dosificado desde entonces. Solo lee la base de la app
// de conteo con su clave pública (la misma que ya usa el calendario). Las ventas se restan en la próxima etapa.
const CONTEO_URL = "https://coldwrbfxpdfutbekysr.supabase.co";
const CONTEO_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGR3cmJmeHBkZnV0YmVreXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjE0MzAsImV4cCI6MjEwMzkzNzQzMH0.7CloDCuNcsm4E3TcEO712RNZdTUvL_BmCrmXWHRRrrc";
const get = async (path) => {
  const response = await fetch(`${CONTEO_URL}/rest/v1/${path}`, { headers: { apikey: CONTEO_ANON, Authorization: `Bearer ${CONTEO_ANON}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const kg = (value) => (value == null ? "—" : `${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`);
const STATUS = { hay: "Hay", poco: "Queda poco", sin: "Sin stock" };

export function StockView() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [depot, setDepot] = useState("todos");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [showOld, setShowOld] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([
      get("kv_store?select=key,value&key=like.log:*"),
      get("dosif_planillas?select=id,fecha,hora,deposito&order=fecha.desc&limit=500"),
      get("dosif_lineas?select=planilla_id,sku,cantidad,componentes&limit=5000"),
    ]).then(([logs, planillas, lineas]) => {
      if (!alive) return;
      setData({ rows: stockNow(latestCounts(logs), dosifiedSince(planillas, lineas)) });
    }).catch((error) => { if (alive) setData({ rows: [], error: `No se pudo leer la app de conteo (${error.message}).` }); });
    return () => { alive = false; };
  }, []);
  const depots = useMemo(() => [...new Set((data?.rows || []).map((row) => row.depot))].filter((item) => showOld || !isOldDepot(item)).sort(), [data, showOld]);
  const hasOld = useMemo(() => (data?.rows || []).some((row) => isOldDepot(row.depot)), [data]);
  const shown = useMemo(() => {
    let rows = searchStock(data?.rows || [], query);
    if (!showOld) rows = rows.filter((row) => !isOldDepot(row.depot));
    if (depot !== "todos") rows = rows.filter((row) => row.depot === depot);
    if (onlyMissing) rows = rows.filter((row) => row.status !== "hay");
    return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data, query, depot, onlyMissing, showOld]);
  return (
    <section className="panel stock-view">
      <div className="panel-head">
        <div><span className="eyebrow">Logística</span><h2>Stock</h2></div>
      </div>
      <p className="muted small">Lo último que contó el depósito en la app de conteo, menos lo que se dosificó después. Si algo no aparece o no cierra, es porque algo pasó (se rompió, se regaló, no se contó): avisale a Diego para que lo ajuste. Las ventas todavía no se restan: eso se define con Diego.</p>
      <div className="list-toolbar">
        <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU (ej. 618, iso, balde)" aria-label="Buscar en el stock" /></label>
        <div className="segmented" role="tablist" aria-label="Depósito">
          {["todos", ...depots].map((item) => <button key={item} type="button" role="tab" aria-selected={depot === item} className={depot === item ? "selected" : ""} onClick={() => setDepot(item)}>{item === "todos" ? "Todos" : depotLabel(item)}</button>)}
        </div>
        {hasOld ? <label className="small"><input type="checkbox" checked={showOld} onChange={(event) => { setShowOld(event.target.checked); setDepot("todos"); }} /> Ver Berazategui (depósito viejo)</label> : null}
        <label className="small"><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} /> Solo sin stock o con poco</label>
      </div>
      {!data ? <p className="muted">Leyendo los conteos…</p> : data.error ? <p className="form-notice">{data.error}</p> : shown.length === 0 ? <p className="muted">No hay productos con ese filtro.</p> : (
        <div className="stock-table" role="table">
          <div className="stock-row stock-head" role="row"><span>Producto</span><span>Depósito</span><span>Contado</span><span>Hoy (estimado)</span><span>Estado</span></div>
          {shown.map((row) => {
            const days = daysSince(row.at);
            return (
              <div className="stock-row" role="row" key={`${row.depId}|${row.sku}`}>
                <span><strong>{row.name}</strong><br /><span className="muted small">{row.sku}{row.category ? ` · ${row.category}` : ""}</span></span>
                <span className="small">{depotLabel(row.depot)}</span>
                <span className="small">{row.count} {String(row.unit || "").toLowerCase()}{row.kg != null && !/kilo/i.test(row.unit) ? ` (${kg(row.kg)})` : ""}<br /><span className={days > 30 ? "quote-warn" : "muted"}>hace {days} {days === 1 ? "día" : "días"}{row.by ? ` · ${row.by}` : ""}{days > 30 ? " · conteo viejo" : ""}</span></span>
                <span className="small">{row.kgNow != null ? kg(row.kgNow) : `${row.count} ${String(row.unit || "").toLowerCase()}`}{row.usedKg ? <><br /><span className="muted">dosificado {kg(row.usedKg)}</span></> : null}</span>
                <span><span className={`badge ${row.status === "hay" ? "ok" : row.status === "poco" ? "warn" : "danger"}`}>{STATUS[row.status]}</span></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
