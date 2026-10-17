import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { coverage, sheetPathFor } from "./product-coverage.mjs";
import { UPLOAD_ACCEPT } from "./document-text.mjs";

// Fichas por producto: el catálogo completo (el del cotizador) contra las fichas de Base técnica.
// Muestra qué falta y deja subir la ficha de cada producto desde acá; si la sube Felipe, queda
// vinculada al producto y el cotizador la muestra también.
export function ProductSheets({ supabase, documents = [], isAdmin, onChanged, onCatalog }) {
  const [products, setProducts] = useState(null);
  const [links, setLinks] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showNotNeeded, setShowNotNeeded] = useState(false);

  async function load() {
    if (!supabase) return;
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: loadError } = await supabase.from("catalog_products").select("id,name,brand,family,subfamily,status").range(from, from + 999);
      if (loadError) { setError("No se pudo leer el catálogo del cotizador."); setProducts([]); return; }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const active = rows.filter((product) => product.status !== "excluido");
    setProducts(active);
    const { data: linkRows } = await supabase.from("product_document_links").select("document_id,scope_type,product_id,family,subfamily");
    setLinks(linkRows || []);
    onCatalog?.({ products: active, links: linkRows || [] });
  }
  useEffect(() => { load(); }, [supabase]);

  const summary = useMemo(() => (products ? coverage(products, documents, links) : null), [products, documents, links]);

  async function upload(product, file) {
    if (!file) return;
    setBusy(product.id); setMessage("");
    try {
      const [{ sha256Hex }, { createUploadedDocuments }] = await Promise.all([import("./file-hash.mjs"), import("./technical-documents-repo.mjs")]);
      const [result] = await createUploadedDocuments([{
        file,
        document: { title: `Ficha técnica · ${product.name}`, family: product.family || "Otra", product: product.name, docType: "ficha_tecnica", source: "other", sourceFile: sheetPathFor(product, file.name), sizeBytes: file.size, sha256: await sha256Hex(file) },
      }]);
      if (!result?.document?.id) throw result?.error || new Error("No se pudo guardar.");
      let linked = false;
      if (isAdmin) {
        const { error: linkError } = await supabase.from("product_document_links").insert({ document_id: result.document.id, scope_type: "product", product_id: product.id, reason: "Ficha cargada desde Fichas por producto" });
        linked = !linkError;
      }
      setMessage(`Ficha de «${product.name}» guardada${linked ? " y vinculada (el cotizador ya la muestra en ese producto)" : ""}.${result.error ? ` Aviso: ${result.error.message}` : ""}`);
      await load();
      onChanged?.();
    } catch (uploadError) {
      setMessage(uploadError.message || "No se pudo subir la ficha.");
    }
    setBusy("");
  }

  async function linkExisting(product, documentId) {
    if (!documentId) return;
    setBusy(product.id); setMessage("");
    const { error: linkError } = await supabase.from("product_document_links").insert({ document_id: documentId, scope_type: "product", product_id: product.id, reason: "Vinculada desde Fichas por producto" });
    setMessage(linkError ? "No se pudo vincular (solo Felipe puede vincular fichas a productos)." : `Ficha vinculada a «${product.name}».`);
    await load();
    setBusy("");
  }

  if (!supabase) return <section className="panel product-sheets"><p className="muted">Qué productos tienen ficha se ve en la versión en línea (lee el catálogo del cotizador).</p></section>;
  return (
    <section className="panel product-sheets">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Los productos del cotizador, uno por uno</span>
          <h2><ClipboardCheck size={18} /> Qué productos tienen ficha</h2>
          <p>Cada producto del catálogo del cotizador y si ya tiene su ficha en Documentos. Sirve para ver qué falta conseguir. Almohadas, colchones, baldes y pisos no llevan ficha y quedan aparte.</p>
        </div>
      </div>
      {error && <div className="system-message error">{error}</div>}
      {!summary && !error && <p className="muted">Leyendo el catálogo…</p>}
      {summary && (
        <>
          <div className="import-counts">
            <span><strong>{summary.totals.withSheet}</strong> con ficha</span>
            <span><strong>{summary.totals.missing}</strong> sin ficha</span>
            <span><strong>{summary.totals.notNeeded}</strong> no la necesitan</span>
          </div>
          <div className="product-sheets-families">
            {summary.families.filter((item) => item.missing.length || item.withSheet.length || showNotNeeded).map((item) => (
              <article key={item.family}>
                <button type="button" className="product-sheets-family" aria-expanded={open === item.family} onClick={() => setOpen(open === item.family ? "" : item.family)}>
                  <strong>{item.family}</strong>
                  <span className={item.missing.length ? "pill warn" : "pill ok"}>{item.missing.length ? `${item.missing.length} sin ficha` : "completa"}</span>
                  <span className="muted small">{item.withSheet.length} con ficha{item.notNeeded.length ? ` · ${item.notNeeded.length} no la necesitan` : ""}</span>
                </button>
                {open === item.family && (
                  <ul>
                    {item.missing.map((product) => (
                      <li key={product.id}>
                        <span>{product.name}{product.subfamily ? <span className="muted small"> · {product.subfamily}</span> : null}</span>
                        <span className="product-sheets-actions">
                          <label className="secondary upload-button">{busy === product.id ? "Subiendo…" : "Subir ficha"}
                            <input type="file" accept={UPLOAD_ACCEPT} hidden disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; upload(product, file); }} />
                          </label>
                          {isAdmin && documents.length > 0 && (
                            <select aria-label={`Vincular una ficha existente a ${product.name}`} value="" disabled={Boolean(busy)} onChange={(event) => linkExisting(product, event.target.value)}>
                              <option value="">o vincular una existente…</option>
                              {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                            </select>
                          )}
                        </span>
                      </li>
                    ))}
                    {item.withSheet.map(({ product, sheets }) => (
                      <li key={product.id} className="has-sheet"><span>{product.name}</span><span className="muted small">✓ {sheets.map((doc) => doc.title).join(" · ")}</span></li>
                    ))}
                    {showNotNeeded && item.notNeeded.map((product) => <li key={product.id} className="not-needed"><span>{product.name}</span><span className="muted small">no lleva ficha</span></li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={showNotNeeded} onChange={(event) => setShowNotNeeded(event.target.checked)} /> Mostrar también los que no llevan ficha</label>
        </>
      )}
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}
