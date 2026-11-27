import { useEffect, useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import { contabiliumByCode, countInfo, dosifiedSince, latestCounts, pivotStock, searchStock, stockNow } from "./stock-model.mjs";
import { adminFetch } from "./admin-api.mjs";

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
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [showOld, setShowOld] = useState(false);
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
  const hasOld = products.some((row) => row.old);
  const shown = useMemo(() => {
    let rows = searchStock(products, query);
    if (onlyMissing) rows = rows.filter((row) => row.status === "sin" || row.status === "poco");
    if (!showOld) rows = rows.filter((row) => row.vd || row.mdq || row.cbVd != null || row.cbMdq != null);
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, query, onlyMissing, showOld]);
  const matched = products.filter((row) => row.cbVd != null || row.cbMdq != null).length;
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
      {cb.loaded ? <p className="muted small">{cbHasDepots ? `Stock de Contabilium (Villa Domínico y Mar del Plata) actualizado ${cbAt ? new Date(cbAt).toLocaleString("es-AR") : ""}: se sincroniza solo 3 veces por día. ${matched} de ${products.length} productos contados lo encontraron por código.` : cbNoDepots ? `Contabilium no le muestra los depósitos al usuario de la API${cbDepotNames.length ? ` (ve: ${cbDepotNames.join(", ")})` : ""}: hay que darle acceso a Villa Domínico y Mar del Plata en Contabilium.` : "Contabilium: falta la primera sincronización del stock por depósito (tocá «Traer stock de Contabilium» o esperá la automática)."}</p> : null}
      <div className="list-toolbar">
        <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU (ej. 618, iso, balde)" aria-label="Buscar en el stock" /></label>
        <label className="small"><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} /> Solo sin stock o con poco</label>
        {hasOld ? <label className="small"><input type="checkbox" checked={showOld} onChange={(event) => setShowOld(event.target.checked)} /> Incluir lo contado solo en Berazategui (depósito viejo)</label> : null}
      </div>
      {!data ? <p className="muted">Leyendo los conteos…</p> : data.error ? <p className="form-notice">{data.error}</p> : shown.length === 0 ? <p className="muted">No hay productos con ese filtro.</p> : (
        <div className="stock-table" role="table">
          <div className="stock-row stock-head" role="row"><span>Producto</span><span>V. Domínico (conteo)</span><span>MDQ (conteo)</span><span>V. Domínico (Contabilium)</span><span>MDQ (Contabilium)</span><span>Estado</span></div>
          {shown.map((row) => {
            const [label, tone] = STATUS[row.status] || STATUS["sin-conteo"];
            return (
              <div className="stock-row" role="row" key={row.sku}>
                <span><strong>{row.name}</strong><br /><span className="muted small">{row.sku}{row.category ? ` · ${row.category}` : ""}{showOld && row.old ? ` · Berazategui: ${qty(row.old.kgNow ?? row.old.count)}` : ""}</span></span>
                <CountCell cell={row.vd} label="V. Domínico (conteo)" />
                <CountCell cell={row.mdq} label="MDQ (conteo)" />
                <CbCell value={row.cbVd} label="V. Domínico (Contabilium)" loaded={cb.loaded} />
                <CbCell value={row.cbMdq} label="MDQ (Contabilium)" loaded={cb.loaded} />
                <span data-label="Estado"><span className={`badge ${tone}`}>{label}</span></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
