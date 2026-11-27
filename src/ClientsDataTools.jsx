import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { SharedDirectory } from "./SharedDirectory.jsx";
import { clientsToCsv, mergeClientsCsv } from "./client-csv.mjs";
import { readFileSmart } from "./text-decode.mjs";
import { today } from "./app-shared";

// Empresas → «Directorio e importar» (27/11, Felipe: el directorio y la importación de clientes van en su módulo, no en
// Datos). Mismo directorio compartido (shared_companies) y mismo importador/exportador CSV que antes estaban en Datos.
export function ClientsDataTools({ data, setData, supabase, session, online }) {
  const [exportFamily, setExportFamily] = useState("Todas");
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const clients = data.clients || [];
  const families = ["Todas", ...new Set(clients.map((client) => client.family || "Sin definir"))];

  function exportClients() {
    const list = exportFamily === "Todas" ? clients : clients.filter((client) => (client.family || "Sin definir") === exportFamily);
    const url = URL.createObjectURL(new Blob([clientsToCsv(list)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clientes-${exportFamily === "Todas" ? "todos" : exportFamily.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage({ text: `CSV exportado: ${list.length} fichas${exportFamily === "Todas" ? "" : ` de ${exportFamily}`}.`, error: false });
  }

  async function importClients(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = mergeClientsCsv(clients, await readFileSmart(file));
      setPending({ ...result, fileName: file.name });
      setMessage({ text: `Vista previa lista: ${result.added} empresas nuevas, ${result.updated} actualizadas y ${result.skipped} filas omitidas. Todavía no se guardó nada.`, error: false });
    } catch (error) {
      setMessage({ text: error.message || "No se pudo importar el CSV.", error: true });
    } finally {
      event.target.value = "";
    }
  }

  function confirmImport() {
    if (!pending) return;
    setData((current) => ({ ...current, clients: pending.clients }));
    const dup = pending.duplicatePhones?.length ? ` ${pending.duplicatePhones.length} teléfonos compartidos quedaron señalados para revisión, sin fusionarse.` : "";
    setMessage({ text: `CSV incorporado: ${pending.added} empresas nuevas, ${pending.updated} actualizadas y ${pending.skipped} filas omitidas.${dup}`, error: false });
    setPending(null);
  }

  return (
    <div className="content-stack">
      {online && <SharedDirectory supabase={supabase} session={session} clients={clients} setClients={(next) => setData((current) => ({ ...current, clients: next }))} />}
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Tu cartera</span>
            <h2>Importar y exportar clientes</h2>
          </div>
        </div>
        <div className="data-cards">
          <article>
            <Download size={24} />
            <h3>Exportar contactos CSV</h3>
            <p>Descargá toda la cartera o una familia. Cada persona o teléfono ocupa una fila y conserva su empresa.</p>
            <select aria-label="Familia a exportar" value={exportFamily} onChange={(event) => setExportFamily(event.target.value)}>
              {families.map((family) => <option key={family}>{family}</option>)}
            </select>
            <button type="button" className="primary" onClick={exportClients}>Descargar CSV</button>
          </article>
          <article>
            <Upload size={24} />
            <h3>Importar clientes CSV</h3>
            <p>Primero muestra una vista previa. Deduplica por CUIT y empresa; nunca fusiona en silencio un teléfono compartido.</p>
            <label className="secondary upload-button">
              Analizar CSV
              <input type="file" accept="text/csv,.csv" onChange={importClients} />
            </label>
          </article>
        </div>
        {pending && (
          <div className="import-preview">
            <strong>Vista previa · {pending.fileName}</strong>
            <p>{pending.added} empresas nuevas · {pending.updated} actualizadas · {pending.skipped} filas omitidas · {pending.duplicatePhones?.length || 0} teléfonos compartidos para revisar.</p>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setPending(null)}>Cancelar</button>
              <button className="primary" type="button" onClick={confirmImport}>Confirmar importación</button>
            </div>
          </div>
        )}
        {message.text && <div className={`system-message${message.error ? " error" : ""}`}>{message.text}</div>}
      </section>
    </div>
  );
}
