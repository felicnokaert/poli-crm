import { useMemo, useState } from "react";
import { DEFAULT_WATCH, VERDICT_TEXT, adsAdvice, buildAdsReport, matchesWatch } from "./ml-ads.mjs";

// Ventas → Mercado Libre → Publicidad (23/10, solo Felipe): campañas de Product Ads por cuenta. La API de publicidad todavía no está
// conectada, así que se pega la tabla del panel de Mercado Libre (Publicidad → Product Ads → Campañas) y el CRM la compara contra el
// objetivo de ROAS de cada campaña. Solo lee y sugiere: no cambia presupuestos ni pausa nada. Se guarda en el espacio de Felipe.
const pesos = (value) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }) : "—");
const x = (value) => (typeof value === "number" ? `${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}x` : "—");
const pct = (value) => (typeof value === "number" ? `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %` : "—");
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const STATUS = { activa: "Activa", pausada: "Pausada", aprendiendo: "Aprendiendo" };

function CampaignRow({ campaign }) {
  const [text, tone] = VERDICT_TEXT[campaign.verdict] || VERDICT_TEXT.sin_datos;
  return (
    <tr>
      <td><strong>{campaign.name}</strong></td>
      <td>{STATUS[campaign.status] || campaign.status}</td>
      <td>{pesos(campaign.budget)}</td>
      <td>{x(campaign.roasTarget)}</td>
      <td>{x(campaign.roas)}</td>
      <td>{pct(campaign.acos)}</td>
      <td>{typeof campaign.sales === "number" ? campaign.sales.toLocaleString("es-AR") : "—"}</td>
      <td>{campaign.status === "activa" ? <em className={`badge ${tone}`}>{text}</em> : <span className="muted small">{campaign.status === "aprendiendo" ? "esperar a que termine de aprender" : "—"}</span>}</td>
    </tr>
  );
}

function Report({ report }) {
  const advice = useMemo(() => adsAdvice(report.campaigns, report.lostByBudget), [report]);
  const active = report.campaigns.filter((campaign) => campaign.status !== "pausada");
  const paused = report.campaigns.filter((campaign) => campaign.status === "pausada");
  const watch = DEFAULT_WATCH.map((term) => ({ term, found: report.campaigns.filter((campaign) => matchesWatch(campaign.name, term)) }));
  const names = (list) => list.map((campaign) => campaign.name).join(", ") || "ninguna";
  return (
    <>
      {report.summary && Object.keys(report.summary).length > 0 && (
        <div className="ml-metrics">
          {[["Presupuesto activo por día", pesos(report.summary.budget)], ["ACOS global", pct(report.summary.acos)], ["ROAS global", x(report.summary.roas)], ["Inversión 30 días", pesos(report.summary.spend)], ["Ingresos 30 días", pesos(report.summary.revenue)]]
            .filter(([, value]) => value !== "—").map(([label, value]) => <div key={label} className="ml-metric"><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      )}
      {report.lostByBudget && <p className="system-message error" role="status">El panel avisa: se pierden {report.lostByBudget.sales} ventas al mes por falta de presupuesto{report.lostByBudget.campaign ? ` en “${report.lostByBudget.campaign}”` : ""}.</p>}
      <div className="ml-ads-advice">
        <h3>Qué mirar (sugerencias, no cambia nada)</h3>
        <ul>
          <li><strong>Candidatas a más presupuesto</strong> (superan su objetivo de ROAS): {names(advice.raise)}. Subir de a pasos (por ejemplo +20 %) y medir 7 días: duplicar de golpe puede empeorar el ACOS.</li>
          <li><strong>Cerca del objetivo</strong>: {names(advice.near)}. Medir unos días antes de tocar.</li>
          <li><strong>Por debajo del objetivo</strong>: {names(advice.review)}. No las frena el presupuesto: conviene revisar palabras clave o el objetivo de ROAS antes de subir plata.</li>
          <li><strong>Aprendiendo</strong>: {names(advice.learning)}. Dejarlas correr; sus números todavía no valen.</li>
        </ul>
      </div>
      <div className="ml-ads-watch">
        <h3>Lista de vigilancia</h3>
        <ul>
          {watch.map(({ term, found }) => (
            <li key={term}><strong>{term}</strong>: {found.length === 0 ? <span className="muted">no aparece en lo pegado</span> : found.map((campaign) => `${campaign.name} (${STATUS[campaign.status]}${campaign.status === "activa" ? `, ${pesos(campaign.budget)}/día, ACOS ${pct(campaign.acos)}` : ""})`).join(" · ")}</li>
          ))}
        </ul>
      </div>
      <div className="table-scroll">
        <table className="sales-history-table">
          <thead><tr><th>Campaña</th><th>Estado</th><th>Presupuesto/día</th><th>ROAS objetivo</th><th>ROAS real</th><th>ACOS</th><th>Ventas</th><th>Contra el objetivo</th></tr></thead>
          <tbody>{active.map((campaign) => <CampaignRow key={campaign.name} campaign={campaign} />)}</tbody>
        </table>
      </div>
      {paused.length > 0 && <p className="muted small">Pausadas ({paused.length}): {paused.map((campaign) => campaign.name).join(", ")}.</p>}
    </>
  );
}

export function MlAds({ ads = {}, onSave, accounts = [] }) {
  const labels = accounts.length ? accounts.map((account) => account.nickname || String(account.seller_id)) : ["POLIPLAST", "FOAM FACTORY"];
  const [account, setAccount] = useState(labels[0]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const saved = ads?.[account];

  function analyze() {
    const report = buildAdsReport(text);
    if (!report.campaigns.length) { setPreview(null); setMessage("No encontré campañas en lo que pegaste. Pegá la tabla del panel (con los títulos de las columnas)."); return; }
    setMessage(""); setPreview(report);
  }
  function save() {
    onSave({ ...(ads || {}), [account]: { savedAt: new Date().toISOString(), ...preview } });
    setPreview(null); setText(""); setMessage(`Guardado para ${account}.`);
  }

  return (
    <section className="panel ml-ads">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Mercado Libre · Product Ads</span>
          <h2>Publicidad</h2>
          <p className="muted">Pegá la tabla de campañas de cada cuenta (Publicidad → Product Ads → Campañas) y el CRM la compara con el objetivo de ROAS. Es una foto del momento en que la pegás: no se actualiza sola. Solo sugiere; no cambia presupuestos ni pausa campañas.</p>
        </div>
      </div>
      <div className="segmented" role="tablist" aria-label="Cuenta de publicidad">
        {labels.map((label) => <button key={label} type="button" role="tab" aria-selected={account === label} className={account === label ? "selected" : ""} onClick={() => { setAccount(label); setPreview(null); setMessage(""); }}>{label}</button>)}
      </div>
      <label className="ml-ads-paste">Pegar la tabla de {account}
        <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="Campaña    Presupuesto/día    ROAS Obj    Ventas    ROAS    ACOS …" />
      </label>
      <div className="panel-head-actions">
        <button type="button" className="secondary" disabled={!text.trim()} onClick={analyze}>Analizar</button>
        {preview && <button type="button" className="primary" onClick={save}>Guardar para {account} ({preview.campaigns.length} campañas)</button>}
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      {preview && (<><p className="muted small">Vista previa (todavía no guardada):</p><Report report={preview} /></>)}
      {!preview && saved && (<><p className="muted small">{account}: pegado el {when(saved.savedAt)}.</p><Report report={saved} /></>)}
      {!preview && !saved && <p className="muted">Todavía no pegaste campañas de {account}.</p>}
    </section>
  );
}
