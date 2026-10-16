import { useMemo, useState } from "react";
import { FolderPlus, Upload } from "lucide-react";
import { FAMILIES } from "./families.mjs";
import { CHOICES, folderOptions, planUpload, resolveUpload } from "./technical-upload-plan.mjs";
import { canExtractText, UPLOAD_ACCEPT } from "./document-text.mjs";

const NEW_FOLDER = "__nueva__";
const familyChoices = FAMILIES.filter((item) => item !== "Sin definir");

// Subir a Base técnica: archivos sueltos o una carpeta entera (PDF, Word, Excel, PowerPoint, texto o
// el .md que arma MarkItDown). Se elige familia y carpeta de destino (existente o nueva), y antes de
// guardar se ve cada choque de nombre o archivo repetido, como al copiar en Windows.
export function TechnicalUpload({ documents = [], onDone }) {
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState(null);
  const [choices, setChoices] = useState({});
  const [family, setFamily] = useState(familyChoices[0]);
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [keepStructure, setKeepStructure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const folders = useMemo(() => folderOptions(documents), [documents]);
  const destination = folder === NEW_FOLDER ? newFolder.trim() : folder;
  const fromFolder = files.some((entry) => entry.relativePath.includes("/"));

  async function pick(event) {
    const picked = [...(event.target.files || [])].filter((file) => !file.name.startsWith("~$") && file.name !== "desktop.ini");
    event.target.value = "";
    if (!picked.length) return;
    setBusy(true); setMessage(""); setItems(null); setChoices({});
    const { sha256Hex } = await import("./file-hash.mjs");
    const list = await Promise.all(picked.map(async (file, index) => ({
      key: `${index}-${file.webkitRelativePath || file.name}`, name: file.name, relativePath: file.webkitRelativePath || file.name,
      size: file.size, sha256: await sha256Hex(file), file,
    })));
    setFiles(list);
    setBusy(false);
  }

  function review() {
    if (folder === NEW_FOLDER && !newFolder.trim()) { setMessage("Escribí el nombre de la carpeta nueva."); return; }
    setItems(planUpload(files, documents, { destination, keepStructure }));
    setMessage("");
  }

  const conflicts = (items || []).filter((item) => item.conflict);
  const chosen = (item) => choices[item.key] || item.choice;
  // "Reemplazar" solo aplica a lo que ya estaba guardado (no a dos archivos iguales de esta misma subida).
  const setAll = (conflict, choice) => setChoices((current) => ({ ...current, ...Object.fromEntries(conflicts.filter((item) => item.conflict === conflict && (choice !== "replace" || item.existing?.id)).map((item) => [item.key, choice])) }));

  async function save() {
    setBusy(true); setMessage("");
    try {
      const plan = resolveUpload(items, choices);
      const byKey = new Map(files.map((entry) => [entry.key, entry]));
      const { createUploadedDocuments, replaceTechnicalDocumentFile } = await import("./technical-documents-repo.mjs");
      const created = await createUploadedDocuments(plan.create.map((item) => {
        const entry = byKey.get(item.key);
        return {
          file: entry.file,
          document: {
            title: item.fileName.replace(/\.[^.]+$/, ""), family, product: "", docType: "sin_clasificar", source: "other",
            sourceFile: item.target, sizeBytes: entry.size, sha256: entry.sha256,
          },
        };
      }));
      let replaced = 0;
      for (const item of plan.replace) {
        const entry = byKey.get(item.key);
        try { await replaceTechnicalDocumentFile(item.existing, entry.file, { sha256: entry.sha256, sizeBytes: entry.size }); replaced += 1; } catch { /* se informa abajo */ }
      }
      const failed = created.filter((result) => result.error).length + (plan.replace.length - replaced);
      const withoutText = plan.create.concat(plan.replace).filter((item) => !canExtractText(item.fileName)).length;
      setMessage([
        `Listo: ${created.length - created.filter((r) => r.error && !r.document?.id).length} subidos, ${replaced} reemplazados, ${plan.skip.length} omitidos.`,
        failed ? `${failed} no se pudieron guardar del todo; probá de nuevo con esos.` : "",
        withoutText ? `${withoutText} son de un formato que el navegador no lee (por ejemplo .doc viejo): quedan guardados, pero para que el copiloto aprenda de ellos pasalos por MarkItDown y subí el .md.` : "",
        "Nada quedó \"vigente\" solo: falta tu validación.",
      ].filter(Boolean).join(" "));
      setFiles([]); setItems(null); setChoices({});
      onDone?.();
    } catch (error) {
      setMessage(error.message || "No se pudo subir.");
    }
    setBusy(false);
  }

  return (
    <section className="panel technical-upload">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Subir a Base técnica</span>
          <h2><Upload size={18} /> Subir fichas y documentos</h2>
          <p>PDF, Word, Excel, PowerPoint, texto o el .md de MarkItDown: el copiloto aprende de su texto. Elegís familia y carpeta, y antes de guardar ves si algo ya existe.</p>
        </div>
      </div>
      <div className="import-box-actions">
        <label className="secondary upload-button"><Upload size={15} /> Elegir archivos
          <input type="file" multiple accept={UPLOAD_ACCEPT} hidden onChange={pick} disabled={busy} />
        </label>
        <label className="secondary upload-button"><FolderPlus size={15} /> Elegir una carpeta entera
          <input type="file" webkitdirectory="" directory="" multiple hidden onChange={pick} disabled={busy} />
        </label>
        {busy && <span className="muted small">Procesando…</span>}
      </div>

      {files.length > 0 && !items && (
        <div className="technical-upload-form">
          <p className="muted small">{files.length} {files.length === 1 ? "archivo elegido" : "archivos elegidos"}.</p>
          <label>Familia
            <select value={family} onChange={(event) => setFamily(event.target.value)}>
              {familyChoices.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>Carpeta de destino
            <select value={folder} onChange={(event) => setFolder(event.target.value)}>
              <option value="">Sin carpeta (raíz)</option>
              {folders.map((item) => <option key={item} value={item}>{item}</option>)}
              <option value={NEW_FOLDER}>+ Nueva carpeta…</option>
            </select>
          </label>
          {folder === NEW_FOLDER && (
            <label>Nombre de la carpeta nueva
              <input value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="Ej: PRODUCTOS / POLIUREA / Fichas 2026" />
            </label>
          )}
          {fromFolder && (
            <label className="check"><input type="checkbox" checked={keepStructure} onChange={(event) => setKeepStructure(event.target.checked)} /> Mantener las subcarpetas de la carpeta elegida</label>
          )}
          <div className="import-box-actions">
            <button type="button" className="primary" onClick={review} disabled={busy}>Revisar antes de subir</button>
            <button type="button" className="secondary" onClick={() => setFiles([])}>Cancelar</button>
          </div>
        </div>
      )}

      {items && (
        <div className="technical-upload-review">
          <p><strong>{items.length - conflicts.length}</strong> nuevos sin problemas{conflicts.length ? <> · <strong>{conflicts.length}</strong> para decidir</> : null}. Familia: {family}.</p>
          {conflicts.length > 0 && (
            <>
              <div className="import-box-actions">
                {conflicts.some((item) => item.conflict === "mismo_nombre") && <>
                  <span className="muted small">Mismo nombre, para todos:</span>
                  <button type="button" className="secondary" onClick={() => setAll("mismo_nombre", "replace")}>Reemplazar</button>
                  <button type="button" className="secondary" onClick={() => setAll("mismo_nombre", "keepBoth")}>Conservar los dos</button>
                  <button type="button" className="secondary" onClick={() => setAll("mismo_nombre", "skip")}>Omitir</button>
                </>}
              </div>
              <ul className="technical-upload-conflicts">
                {conflicts.map((item) => (
                  <li key={item.key}>
                    <div>
                      <strong>{item.fileName}</strong>
                      <span className="muted small">
                        {item.conflict === "mismo_archivo"
                          ? `Este mismo archivo ya está en Base técnica: "${item.existing.sourceFile || item.existing.title}".`
                          : item.existing?.id ? `Ya hay un archivo con este nombre en "${item.folder}".` : "En esta misma subida hay otro archivo con este nombre."}
                      </span>
                    </div>
                    <div className="segmented" role="group" aria-label={`Qué hacer con ${item.fileName}`}>
                      {(item.conflict === "mismo_archivo" ? ["skip", "keepBoth"] : item.existing?.id ? ["replace", "keepBoth", "skip"] : ["keepBoth", "skip"]).map((choice) => (
                        <button key={choice} type="button" className={chosen(item) === choice ? "selected" : ""} aria-pressed={chosen(item) === choice} onClick={() => setChoices((current) => ({ ...current, [item.key]: choice }))}>
                          {choice === "keepBoth" ? (item.keepBothName !== item.fileName ? `Conservar los dos (${item.keepBothName})` : "Subir igual") : CHOICES[choice]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="import-box-actions">
            <button type="button" className="primary" onClick={save} disabled={busy}>{busy ? "Subiendo…" : "Subir"}</button>
            <button type="button" className="secondary" onClick={() => setItems(null)} disabled={busy}>Volver</button>
          </div>
        </div>
      )}
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}
