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

  async function sync(account, stages = ["items", "questions", "extras"]) {
    setError(""); setMessage(""); setBusy(account.seller_id);
    let items = 0;
    let questions = 0;
    let extras = 0;
    const problems = new Set();
    try {
      for (const stage of stages) {
        let offset = 0;
        let scrollId = "";
        let byItem = false;
        for (let guard = 0; guard < 1000; guard += 1) {
          const result = await callApi(session, { op: "sync", sellerId: account.seller_id, stage, offset, scrollId, byItem });
          if (stage === "items") items += result.saved; else if (stage === "questions") questions += result.saved; else extras += result.saved;
          (result.errors || []).forEach((problem) => problems.add(problem));
          setProgress(stage === "items" ? `Publicaciones: ${result.next} de ${result.total}…`
            : stage === "extras" ? `Visitas y clips de las activas: ${result.next} de ${result.total}…`
            : result.byItem && byItem ? `Preguntas, revisando publicación ${result.next} de ${result.total}…`
              : result.byItem ? "Son más de 1000 preguntas: sigo de a una publicación…" : `Preguntas respondidas: ${result.next} de ${result.total}…`);
          offset = result.next;
          scrollId = result.scrollId || "";
          byItem = Boolean(result.byItem);
          if (guard % 4 === 3) loadCounts().catch(() => {});
          if (result.done) break;
        }
      }
      setMessage(`${account.nickname || "Cuenta"}: se guardaron ${items} publicaciones, ${questions} preguntas respondidas y visitas/clips de ${extras} activas.${problems.size ? ` No se pudo leer: ${[...problems].join(" · ")}` : ""}`);
    } catch (syncError) {
      setError(`${syncError.message} (quedó guardado lo que se llegó a traer: ${items} publicaciones, ${questions} preguntas).`);
    }
    setProgress(""); setBusy("");
    await loadAccounts();
    await loadCounts();
  }

  // Prueba de competencia (21/10): los más vendidos de Mercado Libre en nuestras 3 categorías principales.
  const [competition, setCompetition] = useState(null);
  async function probeCompetition(account) {
    setError(""); setBusy(`comp-${account.seller_id}`);
    try { setCompetition({ nickname: account.nickname, ...(await callApi(session, { op: "competition", sellerId: account.seller_id })) }); } catch (probeError) { setError(probeError.message); }
    setBusy("");
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
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={connect}>{busy === "connect" ? "Conectando…" : "Conectar una cuenta"}</button>
        </div>
      </div>
      <p className="muted small">Para conectar otra cuenta (por ejemplo FOAM), primero cerrá sesión en Mercado Libre o entrá con esa cuenta; Mercado Libre conecta la que esté abierta.</p>
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
                  <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => sync(account, ["extras"])}>Solo visitas y clips</button>
                  <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => probeCompetition(account)}>{busy === `comp-${account.seller_id}` ? "Mirando…" : "Probar competencia"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {competition && (
        <div className="ml-competition">
          <h3>Más vendidos en nuestras categorías ({competition.nickname})</h3>
          {competition.errors?.length > 0 && <p className="muted small">No se pudo leer: {competition.errors.join(" · ")}</p>}
          {competition.categories?.map((category) => (
            <div key={category.category}>
              <strong>{category.name}</strong> <span className="muted small">{category.highlights} destacados{category.products ? ` (${category.products} son productos de catálogo)` : ""}</span>
              {category.items.length > 0 ? (
                <ol>{category.items.map((item) => <li key={item.id}><a href={item.permalink} target="_blank" rel="noreferrer">{item.title}</a> · ${Number(item.price || 0).toLocaleString("es-AR")}{item.sold != null ? ` · ${item.sold} vendidos` : ""}{item.ours ? " · nuestra" : ""}</li>)}</ol>
              ) : <p className="muted small">Mercado Libre no devolvió publicaciones sueltas para esta categoría.</p>}
            </div>
          ))}
        </div>
      )}
      {(counts.items !== null || counts.questions !== null) && <p className="muted small">Guardado en el CRM: {counts.items ?? 0} publicaciones y {counts.questions ?? 0} preguntas respondidas.</p>}
    </section>
  );
}
