import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { RefreshCw, Store } from "lucide-react";
import { mlCallbackParams } from "./ml-callback.mjs";
import { clipIdsFrom } from "./ml-clips.mjs";

// Más → Datos → Mercado Libre (solo Felipe, 20/10): conectar las cuentas de Mercado Libre y traer sus
// publicaciones y preguntas ya respondidas como conocimiento para Academia y el futuro asistente.
// Solo lee: nunca publica ni responde nada en Mercado Libre.
const STATE_KEY = "poliplast-ml-state";


async function callApi(session, body) {
  const response = await adminFetch({ action: "mercadolibre", ...body }, session?.access_token);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo hablar con Mercado Libre.");
  return result;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");

export function MercadoLibreSync({ supabase, session }) {
  const [accounts, setAccounts] = useState(null);
  const [counts, setCounts] = useState({ items: null, questions: null });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");

  async function loadCounts() {
    if (!supabase) return;
    const [items, questions] = await Promise.all([
      supabase.from("ml_items").select("id", { count: "exact", head: true }),
      supabase.from("ml_questions").select("id", { count: "exact", head: true }),
    ]);
    setCounts({ items: items.count ?? null, questions: questions.count ?? null });
  }

  async function loadAccounts() {
    try { setAccounts((await callApi(session, { op: "accounts" })).accounts || []); } catch (loadError) { setAccounts([]); setError(loadError.message); }
  }

  useEffect(() => {
    if (!session?.access_token) return;
    const callback = mlCallbackParams();
    (async () => {
      if (callback) {
        let expected = "";
        try { expected = sessionStorage.getItem(STATE_KEY) || ""; } catch { /* sin almacenamiento */ }
        globalThis.history?.replaceState(null, "", globalThis.location.pathname);
        if (expected && expected !== callback.state) setError("La conexión con Mercado Libre no coincide con la que pediste. Probá de nuevo.");
        else {
          setBusy("connect");
          try { setMessage(`Cuenta ${(await callApi(session, { op: "exchange", code: callback.code })).nickname || ""} conectada. Ahora tocá "Actualizar".`); } catch (exchangeError) { setError(exchangeError.message); }
          setBusy("");
        }
      }
      await loadAccounts();
      await loadCounts();
    })();
  }, [session?.access_token]);

  async function connect() {
    setError(""); setBusy("connect");
    try {
      const state = `ml-${crypto.randomUUID()}`;
      try { sessionStorage.setItem(STATE_KEY, state); } catch { /* sin almacenamiento */ }
      globalThis.location.assign((await callApi(session, { op: "authUrl", state })).url);
    } catch (connectError) { setError(connectError.message); setBusy(""); }
  }

  // Las etapas de una cuenta (publicaciones, preguntas, visitas, calidad); suma a `count` y anota problemas.
  async function runStages(account, stages, count, problems) {
    const name = account.nickname || "Cuenta";
    for (const stage of stages) {
      let offset = 0;
      let scrollId = "";
      let byItem = false;
      for (let guard = 0; guard < 1000; guard += 1) {
        const result = await callApi(session, { op: "sync", sellerId: account.seller_id, stage, offset, scrollId, byItem });
        count[stage] = (count[stage] || 0) + (result.saved || 0);
        (result.errors || []).forEach((problem) => problems.add(problem));
        setProgress(`${name} · ` + (stage === "items" ? `Publicaciones: ${result.next} de ${result.total}…`
          : stage === "extras" ? `Visitas de las activas: ${result.next} de ${result.total}…`
          : stage === "health" ? `Calidad y experiencia de compra: ${result.next} de ${result.total}…`
          : result.byItem && byItem ? `Preguntas, revisando publicación ${result.next} de ${result.total}…`
            : result.byItem ? "Son más de 1000 preguntas: sigo de a una publicación…" : `Preguntas respondidas: ${result.next} de ${result.total}…`));
        offset = result.next;
        scrollId = result.scrollId || "";
        byItem = Boolean(result.byItem);
        if (guard % 4 === 3) loadCounts().catch(() => {});
        if (result.done) break;
      }
    }
  }
  const missingSql = (text) => /ml_item_health|ml_competitor|ml_trends|ml_item_economics|team_shared_notes|does not exist|schema cache/i.test(String(text || ""));
  const SQL_HINT = "falta pegar el SQL de docs/SQL_PENDIENTE_2026-10-23.md en Supabase";
  // Corto (21/10, Felipe: "no me gusta que muestre todo este cartel"): hasta 2 problemas y cuántos más.
  const shortList = (problems) => { const list = [...problems]; return list.length ? ` Faltó: ${list.slice(0, 2).join(" · ")}${list.length > 2 ? ` y ${list.length - 2} más` : ""}.` : ""; };

  async function sync(account, stages = ["items", "questions", "extras", "health"]) {
    setError(""); setMessage(""); setBusy(account.seller_id);
    const count = {};
    const problems = new Set();
    try {
      await runStages(account, stages, count, problems);
      setMessage(`${account.nickname || "Cuenta"}: listo. ${count.items || 0} publicaciones, ${count.questions || 0} preguntas, visitas de ${count.extras || 0} activas y calidad de ${count.health || 0}.${shortList(problems)}`);
    } catch (syncError) {
      setError(missingSql(syncError.message) ? `Lo demás quedó al día; para la calidad ${SQL_HINT}.` : `${syncError.message} (quedó guardado lo que se llegó a traer: ${count.items || 0} publicaciones, ${count.questions || 0} preguntas).`);
    }
    setProgress(""); setBusy("");
    await loadAccounts();
    await loadCounts();
  }

  // 23/10 (Felipe: "un botón que actualice todo"): las 3 cuentas (publicaciones, preguntas, visitas, calidad y
  // el resumen con ventas, comisiones y envíos) y después la competencia y las tendencias. Cada paso es un
  // pedido aparte, así ninguno pasa el minuto que permite el servidor; si uno falla, siguen los demás.
  async function syncEverything() {
    setError(""); setMessage(""); setBusy("all");
    const done = [];
    const failed = [];
    const problems = new Set();
    let sqlMissing = false;
    for (const account of accounts || []) {
      const name = account.nickname || account.seller_id;
      const count = {};
      try {
        await runStages(account, ["items", "questions", "extras", "health"], count, problems);
      } catch (stageError) {
        if (missingSql(stageError.message)) sqlMissing = true; else failed.push(`${name}: ${stageError.message}`);
      }
      setProgress(`${name} · Resumen: ventas, comisiones y envíos…`);
      try {
        const result = await callApi(session, { op: "metrics", sellerId: account.seller_id });
        (result.errors || []).forEach((problem) => { if (missingSql(problem)) sqlMissing = true; else problems.add(problem); });
      } catch (metricsError) { failed.push(`${name} (resumen): ${metricsError.message}`); }
      done.push(`${name} ${count.items || 0} publicaciones`);
    }
    setProgress("Competencia en Mercado Libre…");
    try { await callApi(session, { op: "competitors-refresh" }); } catch (competitionError) { if (missingSql(competitionError.message)) sqlMissing = true; else failed.push(`competencia: ${competitionError.message}`); }
    setProgress("Tendencias de búsqueda…");
    try {
      const result = await callApi(session, { op: "trends-refresh" });
      (result.errors || []).forEach((problem) => problems.add(`tendencias ${problem}`));
    } catch (trendsError) { if (missingSql(trendsError.message)) sqlMissing = true; else failed.push(`tendencias: ${trendsError.message}`); }
    setMessage(`Listo: ${done.join(", ")}, resumen, competencia y tendencias.${sqlMissing ? ` Para calidad, competencia y ganancia ${SQL_HINT}.` : ""}${shortList(problems)}`);
    if (failed.length) setError(failed.slice(0, 3).join(" · "));
    setProgress(""); setBusy("");
    await loadAccounts();
    await loadCounts();
  }

  // Clips pegados desde Mercado Libre (la API no los deja leer).
  const [clipText, setClipText] = useState("");
  const [clipComplete, setClipComplete] = useState(true);
  const [clipHas, setClipHas] = useState(true); // false = pegó las que NO tienen clip
  const [clipSeller, setClipSeller] = useState("");
  const [clipOpen, setClipOpen] = useState(false);
  async function saveClips() {
    setError(""); setMessage(""); setBusy("clips");
    try {
      const items = [];
      for (let page = 0; page < 5; page += 1) {
        const { data } = await supabase.from("ml_items").select("id,title,seller_id").order("id").range(page * 1000, page * 1000 + 999);
        items.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const { ids, titles } = clipIdsFrom(clipText, clipSeller ? items.filter((item) => item.seller_id === clipSeller) : items);
      const result = await callApi(session, { op: "clips", ids, complete: clipComplete && Boolean(clipSeller), has: clipHas, sellerId: clipSeller });
      setMessage(`Clips: se marcaron ${result.marked} publicaciones ${clipHas ? "con" : "sin"} clip${titles ? ` (${titles} por título)` : ""}.${clipComplete ? ` Las demás activas quedan como “${clipHas ? "sin" : "con"} clip”.` : ""}`);
      setClipText(""); setClipOpen(false);
    } catch (clipError) { setError(clipError.message); }
    setBusy("");
  }

  // Reportes de competencia pegados desde Mercado Libre (Métricas → Competencia / mejores vendedores).
  const [reports, setReports] = useState([]);
  const [report, setReport] = useState({ open: false, account: "", section: "Competencia", content: "" });
  useEffect(() => {
    if (!supabase?.from) return;
    try { Promise.resolve(supabase.from("ml_competition_reports").select("id,account,section,created_at,content").order("created_at", { ascending: false }).limit(30)).then(({ data }) => setReports(data || []), () => {}); } catch { /* sin reportes */ }
  }, [supabase]);
  async function saveReport() {
    setError(""); setBusy("report");
    const row = { account: report.account, section: report.section, content: report.content.trim().slice(0, 60000) };
    const { data, error: saveError } = await supabase.from("ml_competition_reports").insert(row).select("id,account,section,created_at,content");
    setBusy("");
    if (saveError || !data?.length) { setError("No se pudo guardar el reporte."); return; }
    setReports((current) => [data[0], ...current]);
    setReport({ open: false, account: "", section: "Competencia", content: "" });
    setMessage("Reporte guardado: el asistente ya lo puede usar.");
  }
  async function removeReport(id) {
    const { error: deleteError } = await supabase.from("ml_competition_reports").delete().eq("id", id);
    if (!deleteError) setReports((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Conocimiento para el asistente</span>
          <h2><Store size={18} /> Mercado Libre</h2>
          <p>Trae las publicaciones (título, características y descripción) y las preguntas que ya respondieron, para que Academia y el asistente aprendan de ellas. Solo lee: nunca publica ni responde nada en Mercado Libre. No se guarda quién preguntó.</p>
        </div>
        <div className="panel-head-actions">
          {accounts?.length > 0 && <button type="button" className="primary" disabled={Boolean(busy)} onClick={syncEverything}><RefreshCw size={14} /> {busy === "all" ? "Actualizando todo…" : `Actualizar todo (las ${accounts.length} cuentas)`}</button>}
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={connect}>{busy === "connect" ? "Conectando…" : "Conectar una cuenta"}</button>
        </div>
      </div>
      <p className="muted small">"Actualizar todo" hace, para cada cuenta, publicaciones, preguntas, visitas, calidad y el resumen (ventas, comisiones y envíos), y después la competencia y las tendencias. Tarda varios minutos: dejá la pestaña abierta. Todos los días a la mañana se hace solo una versión más corta.</p>
      <p className="muted small">Para conectar otra cuenta (por ejemplo FOAM), primero cerrá sesión en Mercado Libre o entrá con esa cuenta; Mercado Libre conecta la que esté abierta.</p>
      <div className="ml-clips">
        <button type="button" className="link-button" onClick={() => setClipOpen(!clipOpen)}>{clipOpen ? "Cerrar clips" : "Cargar qué publicaciones tienen clip"}</button>
        {clipOpen && (
          <div className="ml-clips-form">
            <p className="muted small">Mercado Libre no deja leer los clips desde el CRM. En Mercado Libre → Publicaciones, filtrá Activas y "Sin videos publicados" (o las que tienen), copiá cada página (Ctrl+A, Ctrl+C) y pegalas todas acá, una abajo de la otra. Se reconocen los códigos (#…, MLA…), los links y los títulos.</p>
            <select value={clipSeller} onChange={(event) => setClipSeller(event.target.value)} aria-label="Cuenta de los clips">
              <option value="">Cuenta…</option>
              {(accounts || []).map((account) => <option key={account.seller_id} value={account.seller_id}>{account.nickname}</option>)}
            </select>
            <div className="assistant-teach-actions small">
              <label><input type="radio" checked={clipHas} onChange={() => setClipHas(true)} /> Pegué las que <strong>tienen</strong> clip</label>
              <label><input type="radio" checked={!clipHas} onChange={() => setClipHas(false)} /> Pegué las que <strong>no tienen</strong> clip</label>
            </div>
            <textarea rows={6} value={clipText} onChange={(event) => setClipText(event.target.value)} placeholder={"https://articulo.mercadolibre.com.ar/MLA-3218666158-…\nMLA2212937382\nResina Epoxi Poxiplast 750gr…"} />
            <label className="small"><input type="checkbox" checked={clipComplete} onChange={(event) => setClipComplete(event.target.checked)} /> Es la lista completa de esta cuenta (las demás activas de la cuenta quedan al revés)</label>
            <button type="button" className="primary" disabled={!clipText.trim() || !clipSeller || Boolean(busy)} onClick={saveClips}>{busy === "clips" ? "Guardando…" : "Guardar clips"}</button>
          </div>
        )}
      </div>
      <div className="ml-clips">
        <button type="button" className="link-button" onClick={() => setReport((current) => ({ ...current, open: !current.open }))}>{report.open ? "Cerrar" : "Pegar un reporte de competencia de Mercado Libre"}</button>
        {report.open && (
          <div className="ml-clips-form">
            <p className="muted small">Mercado Libre no entrega la competencia por la API. Abrí Métricas → Competencia (o mejores vendedores) en la cuenta, seleccioná todo (Ctrl+A), copiá (Ctrl+C) y pegalo acá. Queda guardado con la fecha y el asistente lo usa para responder.</p>
            <div className="assistant-teach-actions">
              <select value={report.account} onChange={(event) => setReport((current) => ({ ...current, account: event.target.value }))} aria-label="Cuenta">
                <option value="">Cuenta…</option>
                {(accounts || []).map((account) => <option key={account.seller_id} value={account.nickname}>{account.nickname}</option>)}
              </select>
              <select value={report.section} onChange={(event) => setReport((current) => ({ ...current, section: event.target.value }))} aria-label="Sección">
                {["Competencia", "Mejores vendedores", "Métricas del negocio", "Otro"].map((name) => <option key={name}>{name}</option>)}
              </select>
            </div>
            <textarea rows={8} value={report.content} onChange={(event) => setReport((current) => ({ ...current, content: event.target.value }))} placeholder="Pegá acá lo que copiaste de Mercado Libre" />
            <button type="button" className="primary" disabled={!report.content.trim() || Boolean(busy)} onClick={saveReport}>{busy === "report" ? "Guardando…" : "Guardar reporte"}</button>
          </div>
        )}
        {reports.length > 0 && (
          <ul className="assistant-rivals">
            {reports.map((item) => <li key={item.id} className="small">{new Date(item.created_at).toLocaleDateString("es-AR")} · {item.section}{item.account ? ` · ${item.account}` : ""} · {item.content.length.toLocaleString("es-AR")} caracteres <button type="button" className="link-button" onClick={() => removeReport(item.id)}>Borrar</button></li>)}
          </ul>
        )}
      </div>
      {message && <div className="system-message">{message}</div>}
      {error && <div className="system-message error">{error}</div>}
      {progress && <p className="muted" role="status">{progress}</p>}
      {accounts === null && <p className="muted">Cargando…</p>}
      {accounts && accounts.length === 0 && !error && <p className="muted">Todavía no hay cuentas conectadas.</p>}
      {accounts && accounts.length > 0 && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Cuenta</th><th>Última actualización</th><th /></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.seller_id}>
                <td><strong>{account.nickname || account.seller_id}</strong></td>
                <td>{fmt(account.last_sync_at)}</td>
                <td className="ml-sync-actions">
                  <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => sync(account)}><RefreshCw size={14} /> {busy === account.seller_id ? "Actualizando…" : "Actualizar todo"}</button>
                  <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => sync(account, ["extras"])}>Solo visitas</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {(counts.items !== null || counts.questions !== null) && <p className="muted small">Guardado en el CRM: {counts.items ?? 0} publicaciones y {counts.questions ?? 0} preguntas respondidas.</p>}
    </section>
  );
}
