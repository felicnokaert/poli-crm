import { useEffect, useRef, useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { PlugZap } from "lucide-react";

// Más → Datos → Contabilium (solo Felipe, 21/10). Prueba que las claves de las 3 empresas funcionan y trae
// sus comprobantes al CRM. Solo lee: no crea ni cambia nada en Contabilium. La copia tiene memoria: cada
// pasada sigue donde quedó la anterior (y el cron diario sigue solo), así que se puede cortar cuando sea.
const MAX_ROUNDS = 400; // tope de pasadas seguidas por empresa al traer el historial

async function callApi(session, body) {
  const response = await adminFetch({ action: "contabilium", ...body }, session?.access_token);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo hablar con Contabilium.");
  return result;
}

const shortDate = (day) => (day ? day.split("-").reverse().join("/") : "—");
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

export function ContabiliumTest({ session }) {
  const [companies, setCompanies] = useState(null);
  const [sync, setSync] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const stop = useRef(false);

  useEffect(() => {
    if (!session?.access_token) return;
    callApi(session, { op: "status" }).then((result) => setSync(result.companies || []), () => {});
  }, [session]);

  async function test() {
    setBusy("test"); setError("");
    try { setCompanies((await callApi(session, { op: "test" })).companies || []); } catch (testError) { setError(testError.message); }
    setBusy("");
  }

  async function bring() {
    setBusy("sync"); setError(""); stop.current = false;
    const problems = [];
    for (const company of sync || []) {
      let fails = 0;
      for (let round = 0; round < MAX_ROUNDS && !stop.current; round += 1) {
        let result;
        try { result = await callApi(session, { op: "sync", company: company.key }); } catch (syncError) {
          // Un corte suelto (el servidor tardó): reintenta hasta 3 veces seguidas antes de pasar a la siguiente.
          fails += 1;
          if (fails < 3) continue;
          problems.push(`${company.name}: ${syncError.message}`); break;
        }
        fails = 0;
        const state = result.company;
        setSync((current) => current.map((row) => (row.key === state.key ? { ...row, ...state } : row)));
        setProgress(`${company.name}: llegó al ${shortDate(state.cursor_date)} · ${state.total_saved} comprobantes`);
        if (state.last_error) { problems.push(`${company.name}: ${state.last_error}`); break; }
        if (state.done) break;
      }
      if (stop.current) break;
    }
    setProgress(stop.current ? "Pausado. La próxima vez sigue desde donde quedó." : "Listo.");
    if (problems.length) setError(problems.join(" · "));
    setBusy("");
  }

  // Fichas de clientes (22/10): CUIT, teléfono y mail, para emparejar con la cartera. Página a página.
  async function bringClients() {
    setBusy("clients"); setError(""); stop.current = false;
    const problems = [];
    for (const company of sync || []) {
      let fails = 0;
      for (let round = 0; round < MAX_ROUNDS && !stop.current; round += 1) {
        let result;
        try { result = await callApi(session, { op: "clients", company: company.key }); } catch (clientError) {
          fails += 1;
          if (fails < 3) continue;
          problems.push(`${company.name}: ${clientError.message}`); break;
        }
        fails = 0;
        const state = result.company;
        setProgress(`Fichas de ${company.name}: ${state.total_saved || 0} clientes${state.history_done ? " (completo)" : ` · página ${state.page}`}`);
        if (state.last_error) { problems.push(`${company.name}: ${state.last_error}`); break; }
        if (state.history_done && state.page === 1) break;
      }
      if (stop.current) break;
    }
    setProgress(stop.current ? "Pausado. La próxima vez sigue desde donde quedó." : "Listo: fichas de clientes copiadas. Ahora la cartera se empareja también por CUIT y teléfono.");
    if (problems.length) setError(problems.join(" · "));
    setBusy("");
  }

  return (
    <section className="panel contabilium-test">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Conexión</span>
          <h2><PlugZap size={18} /> Contabilium</h2>
          <p>Prueba las claves de API de las empresas y trae sus comprobantes al CRM. Solo lee: no crea, cambia ni borra nada en Contabilium.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={test}>{busy === "test" ? "Probando…" : "Probar conexión"}</button>
        </div>
      </div>
      {error && <div className="system-message error">{error}</div>}
      {companies && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Empresa</th><th>Estado</th><th>Clientes</th><th>Productos</th></tr></thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.key}>
                <td><strong>{company.name}</strong></td>
                <td>{company.ok ? <span className="badge ok">Conectada</span> : <span className="badge warn">{company.error || "No conecta"}</span>}</td>
                <td>{company.clientes ?? "—"}</td>
                <td>{company.productos ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <div className="panel-head">
        <div>
          <h3>Comprobantes</h3>
          <p className="muted small">Facturas, notas de crédito y cotizaciones de las ventas directas de cada empresa, desde el principio. Las ventas de Mercado Libre no se guardan: están en su panel. Se traen de a tramos y se acuerda hasta dónde llegó: si cerrás la página, la próxima vez sigue desde ahí. Todos los días a las 7 se suma solo lo nuevo.</p>
        </div>
        <div className="panel-head-actions">
          {busy === "sync" || busy === "clients"
            ? <button type="button" className="secondary" onClick={() => { stop.current = true; }}>Pausar</button>
            : <>
              <button type="button" className="primary" disabled={Boolean(busy) || !sync} onClick={bring}>Traer comprobantes</button>
              <button type="button" className="secondary" disabled={Boolean(busy) || !sync} onClick={bringClients}>Traer fichas de clientes</button>
            </>}
        </div>
      </div>
      {progress && <p className="muted small" role="status">{progress}</p>}
      {sync && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Empresa</th><th>Historial</th><th>Llegó hasta</th><th>Guardados</th><th>Última vez</th></tr></thead>
          <tbody>
            {sync.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.name}</strong>{row.last_error && <><br /><span className="badge warn">{row.last_error}</span></>}</td>
                <td>{row.history_done ? <span className="badge ok">Completo</span> : <span className="badge warn">{row.last_run_at ? "En curso" : "Sin empezar"}</span>}</td>
                <td>{row.last_run_at ? shortDate(row.cursor_date) : "—"}</td>
                <td>{row.total_saved || 0}</td>
                <td>{when(row.last_run_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
