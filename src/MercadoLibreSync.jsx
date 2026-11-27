import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { RefreshCw, Store } from "lucide-react";
import { mlCallbackParams } from "./ml-callback.mjs";

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
  const missingSql = (text) => /ml_item_health|ml_competitor|ml_catalog_status|ml_trends|ml_item_economics|team_shared_notes|does not exist|schema cache/i.test(String(text || ""));
  const SQL_HINT = "falta pegar el SQL de docs/SQL_PENDIENTE_CATALOGO_2026-10-23.md en Supabase";
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
    // 23/10: la competencia que deja ver Mercado Libre es la del catálogo (otros vendedores del mismo producto).
    for (const account of accounts || []) {
      try {
        let offset = 0;
        for (let guard = 0; guard < 60; guard += 1) {
          const result = await callApi(session, { op: "catalog-refresh", sellerId: account.seller_id, offset });
          setProgress(`${account.nickname || account.seller_id} · Competencia del catálogo: ${result.next} de ${result.total}…`);
          offset = result.next;
          if (result.done || !result.total) break;
        }
      } catch (competitionError) { if (missingSql(competitionError.message)) sqlMissing = true; else failed.push(`competencia ${account.nickname || ""}: ${competitionError.message}`); }
    }
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
      <p className="muted small">"Actualizar todo" hace, para cada cuenta, publicaciones, preguntas, visitas, calidad (que trae si tiene clip) y el resumen (ventas, comisiones y envíos), y después la competencia y las tendencias. Tarda varios minutos: dejá la pestaña abierta. Todos los días se hace solo: de madrugada se revisa el clip de las que no tienen, y antes de las 7 una versión más corta del resto.</p>
      <p className="muted small">Para conectar otra cuenta (por ejemplo FOAM), primero cerrá sesión en Mercado Libre o entrá con esa cuenta; Mercado Libre conecta la que esté abierta.</p>
      <p className="muted small">Los clips se leen solos de la calidad de cada publicación y la competencia sale del catálogo (Ventas → Mercado Libre → Mercado). Ya no hace falta pegar nada a mano.</p>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {(counts.items !== null || counts.questions !== null) && <p className="muted small">Guardado en la app: {counts.items ?? 0} publicaciones y {counts.questions ?? 0} preguntas respondidas.</p>}
    </section>
  );
}
