import { useState } from "react";
import { PlugZap } from "lucide-react";

// Más → Datos → Contabilium (solo Felipe, 21/10): prueba que las claves de las 3 empresas funcionan,
// leyendo cuántos clientes y productos tiene cada una. Solo lee: no crea ni cambia nada en Contabilium.
export function ContabiliumTest({ session }) {
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "contabilium", op: "test" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo probar Contabilium.");
      setCompanies(result.companies || []);
    } catch (testError) { setError(testError.message); }
    setBusy(false);
  }

  return (
    <section className="panel contabilium-test">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Conexión</span>
          <h2><PlugZap size={18} /> Contabilium</h2>
          <p>Prueba que las claves de API de las 3 empresas funcionan. Solo lee cuántos clientes y productos hay: no crea, cambia ni borra nada en Contabilium.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" disabled={busy} onClick={test}>{busy ? "Probando…" : "Probar conexión"}</button>
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
    </section>
  );
}
