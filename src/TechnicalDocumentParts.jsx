import { useEffect, useState } from "react";
import { UPLOAD_ACCEPT, extensionOf } from "./document-text.mjs";
import { keyFacts } from "./technical-insights.mjs";

// Partes de Base técnica: la fila de cada documento, las carpetas, los grupos y la ficha completa.
// Salieron de TechnicalDocuments.jsx (QA 16/10: tenía 755 líneas), sin cambios de comportamiento.
export const TECHNICAL_DOCUMENT_STATUS_LABELS = {
  inventariado: "Inventariado",
  posible_duplicado: "Posible duplicado",
  pendiente_validacion: "Pendiente de validación",
  vigente: "Vigente",
  desactualizado: "Desactualizado",
  no_tecnico: "No técnico",
};

// Tipo de archivo adjunto, por la extensión de la ruta guardada.
const KIND = { pdf: "PDF", docx: "Word", doc: "Word", xlsx: "Excel", xls: "Excel", pptx: "PowerPoint", txt: "texto", md: "texto", csv: "CSV", jpg: "foto", jpeg: "foto", png: "foto", webp: "foto", heic: "foto" };
const fileKind = (doc) => KIND[extensionOf(doc.storagePath || "")] || "";

// Borrado en tanda (solo Felipe): qué documentos entran en cada opción.

export function TechnicalDocumentRow({ doc, allDocuments, titleDrafts, setTitleDrafts, saveTitle, draftFor, updateDraft, saveStatus, isAdmin, attachFile, viewFile, deleteDocument, moveDocumentToFolder, selectedIds, toggleSelect, openSheet, productsByDoc }) {
  const [textOpen, setTextOpen] = useState(false);
  const draft = draftFor(doc);
  const [folderFromSourceFile, setFolderFromSourceFile] = useState(null);
  useEffect(() => {
    import("./technical-documents-mapping.mjs").then(({ folderFromSourceFile: fn }) => setFolderFromSourceFile(() => fn));
  }, []);
  const currentFolder = folderFromSourceFile ? folderFromSourceFile(doc.sourceFile) : "";
  const [folderDraft, setFolderDraft] = useState(currentFolder);
  useEffect(() => setFolderDraft(currentFolder), [currentFolder]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  return (
    <article className={`technical-document-row ${selectedIds?.has(doc.id) ? "selected" : ""}`}>
      {isAdmin && toggleSelect && (
        <input type="checkbox" className="technical-document-select" aria-label={`Seleccionar ${doc.title}`} checked={selectedIds.has(doc.id)} onChange={() => toggleSelect(doc.id)} />
      )}
      <div>
        <input
          className="technical-document-title-input"
          value={titleDrafts[doc.id] ?? doc.title}
          onChange={(event) => setTitleDrafts((current) => ({ ...current, [doc.id]: event.target.value }))}
          onBlur={() => saveTitle(doc)}
        />
        <input
          className="technical-document-folder-move-input"
          title="Carpeta - editá para mover la ficha (una carpeta nueva se crea sola al escribirla)"
          value={folderDraft}
          onChange={(event) => setFolderDraft(event.target.value)}
          onBlur={() => {
            if (folderDraft.trim() !== currentFolder) {
              moveDocumentToFolder(doc, folderDraft.trim() === "Sin carpeta" ? "" : folderDraft.trim());
            }
          }}
        />
        <span>
          {doc.family}
          {doc.product ? ` · ${doc.product}` : ""} ·{" "}
          {TECHNICAL_DOCUMENT_STATUS_LABELS[doc.status] || doc.status}
        </span>
        {doc.status === "vigente" && (
          <span>
            Validado por {doc.verifiedByEmail || "?"} ·{" "}
            {doc.verifiedAt ? new Date(doc.verifiedAt).toLocaleDateString("es-AR") : ""}
          </span>
        )}
        {doc.status === "desactualizado" && doc.replacedBy && (
          <span>
            Reemplazada por: {allDocuments.find((item) => item.id === doc.replacedBy)?.title || "documento eliminado"}
          </span>
        )}
        <span className={doc.storagePath || doc.extractedText ? "technical-document-text-ok" : "technical-document-text-missing"}>
          {doc.storagePath
            ? `Documento adjunto${fileKind(doc) ? ` (${fileKind(doc)})` : ""}${doc.extractedText ? " · el copiloto lee su texto" : ""}`
            : doc.extractedText
              ? "Texto guardado (sin archivo) · el copiloto lo lee"
              : "Sin archivo ni texto todavía"}
          {" "}
          {openSheet && (
            <button type="button" className="technical-document-file-link" onClick={() => openSheet(doc.id)}>
              Ficha completa
            </button>
          )}
          {" "}
          {doc.storagePath && (
            <button type="button" className="technical-document-file-link" onClick={() => viewFile(doc)}>
              Ver documento
            </button>
          )}
          {!doc.storagePath && doc.extractedText && (
            <button type="button" className="technical-document-file-link" onClick={() => setTextOpen(true)}>
              Ver texto
            </button>
          )}
          {" "}
          <label className="technical-document-file-link">
            {doc.storagePath ? "Reemplazar" : "Adjuntar archivo"}
            <input
              type="file"
              accept={UPLOAD_ACCEPT}
              hidden
              onChange={(event) => attachFile(doc, event.target.files?.[0])}
            />
          </label>
        </span>
        {productsByDoc && (
          <span className="muted small">
            {(productsByDoc.get(doc.id) || []).length
              ? `Producto${productsByDoc.get(doc.id).length === 1 ? "" : "s"}: ${productsByDoc.get(doc.id).slice(0, 3).map((product) => product.name).join(" · ")}${productsByDoc.get(doc.id).length > 3 ? ` y ${productsByDoc.get(doc.id).length - 3} más` : ""}`
              : "Sin vincular a un producto del catálogo"}
          </span>
        )}
        {textOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Texto de ${doc.title}`} onClick={() => setTextOpen(false)}>
            <div className="modal technical-text-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-head"><h2>{doc.title}</h2><button type="button" className="secondary" onClick={() => setTextOpen(false)}>Cerrar</button></div>
              <pre>{doc.extractedText}</pre>
            </div>
          </div>
        )}
      </div>
      <div className="technical-document-options">
        <button
          type="button"
          className="technical-document-options-toggle"
          onClick={() => setOptionsOpen((current) => !current)}
        >
          ⋯ Opciones
        </button>
        {optionsOpen && (
          <div className="technical-document-actions">
            <select aria-label="Estado del documento"
              value={draft.status}
              onChange={(event) => updateDraft(doc.id, { status: event.target.value })}
            >
              {Object.entries(TECHNICAL_DOCUMENT_STATUS_LABELS)
                .filter(([key]) => key !== "vigente" || isAdmin)
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </select>
            {draft.status === "desactualizado" && (
              <select aria-label="Reemplazada por"
                value={draft.replacedBy || ""}
                onChange={(event) => updateDraft(doc.id, { replacedBy: event.target.value })}
              >
                <option value="">Reemplazada por (opcional)</option>
                {allDocuments
                  .filter((item) => item.id !== doc.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
              </select>
            )}
            <input
              placeholder="Observación (queda en el historial)"
              value={draft.notes}
              onChange={(event) => updateDraft(doc.id, { notes: event.target.value })}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => saveStatus(doc)}
            >
              Guardar
            </button>
            {isAdmin && (
              <button
                type="button"
                className="danger-link"
                onClick={() => deleteDocument(doc)}
              >
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// Todas las fichas de un nodo, incluidas las de sus subcarpetas - lo que
// "eliminar carpeta" necesita borrar de un saque.
function collectNodeDocuments(node) {
  return [...node.documents, ...node.children.flatMap(collectNodeDocuments)];
}

// Una carpeta real por nivel (Drive/Explorador de archivos), no una fila con
// el camino completo como título - PRODUCTOS > POLIURETANOS RIGIDOS > Ficha
// Técnica 619 SP son tres carpetas anidadas, cada una colapsable, y los
// documentos solo cuelgan de la carpeta hoja a la que pertenecen.
export function TechnicalDocumentFolderNode({ node, depth, rowProps }) {
  const [nameDraft, setNameDraft] = useState(node.name || "");
  if (node.name === null) {
    return (
      <>
        {node.children.map((child) => (
          <TechnicalDocumentFolderNode key={child.path} node={child} depth={0} rowProps={rowProps} />
        ))}
        {node.documents.map((doc) => (
          <TechnicalDocumentRow key={doc.id} doc={doc} {...rowProps} />
        ))}
      </>
    );
  }
  return (
    <details className="technical-document-folder">
      <summary className="technical-document-folder-heading">
        <span className="technical-document-folder-arrow" aria-hidden="true" />
        <span className="technical-document-folder-icon" aria-hidden="true">📁</span>
        <input
          className="technical-document-folder-name-input"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onBlur={() => rowProps.renameFolderTo(node.path, nameDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className="technical-document-folder-count">{node.count}</span>
        {rowProps.isAdmin && (
          <button
            type="button"
            className="danger-link technical-document-folder-delete"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              rowProps.deleteFolder(node.path, collectNodeDocuments(node));
            }}
          >
            Eliminar carpeta
          </button>
        )}
      </summary>
      <div className="technical-document-folder-body">
        {node.children.map((child) => (
          <TechnicalDocumentFolderNode key={child.path} node={child} depth={depth + 1} rowProps={rowProps} />
        ))}
        {node.documents.map((doc) => (
          <TechnicalDocumentRow key={doc.id} doc={doc} {...rowProps} />
        ))}
      </div>
    </details>
  );
}

export function TechnicalDocumentGroups({ documents, groupByFolder, ...rest }) {
  const [buildFolderTree, setBuildFolderTree] = useState(null);
  useEffect(() => {
    import("./technical-documents-mapping.mjs").then(({ buildFolderTree: fn }) => setBuildFolderTree(() => fn));
  }, []);
  const rowProps = { allDocuments: documents, ...rest };
  if (!groupByFolder || !buildFolderTree) {
    return (
      <div className="conversation-list">
        {[...documents].sort((a, b) => (a.title || "").localeCompare(b.title || "")).map((doc) => (
          <TechnicalDocumentRow key={doc.id} doc={doc} {...rowProps} />
        ))}
      </div>
    );
  }
  const tree = buildFolderTree(documents);
  return (
    <div className="conversation-list technical-document-tree">
      <TechnicalDocumentFolderNode node={tree} depth={0} rowProps={rowProps} />
    </div>
  );
}

// Todo de una ficha en una sola vista: archivo, datos clave (las líneas tal cual están escritas) y
// productos del catálogo que la usan.
export function TechnicalDocumentSheet({ doc, products = [], viewFile, onClose }) {
  const facts = keyFacts(doc);
  const [showText, setShowText] = useState(false);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Ficha de ${doc.title}`} onClick={onClose}>
      <div className="modal technical-sheet-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{doc.family}{doc.product ? ` · ${doc.product}` : ""}</span>
            <h2>{doc.title}</h2>
            <span className={`pill ${doc.status === "vigente" ? "" : "warn"}`}>{TECHNICAL_DOCUMENT_STATUS_LABELS[doc.status] || doc.status}</span>
            {doc.status === "vigente" && doc.verifiedByEmail && <span className="muted small"> Validada por {doc.verifiedByEmail}{doc.verifiedAt ? ` el ${new Date(doc.verifiedAt).toLocaleDateString("es-AR")}` : ""}</span>}
          </div>
          <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div className="technical-sheet-actions">
          {doc.storagePath && <button type="button" className="primary" onClick={() => viewFile(doc)}>Ver documento{fileKind(doc) ? ` (${fileKind(doc)})` : ""}</button>}
          {doc.extractedText && <button type="button" className="secondary" onClick={() => setShowText((value) => !value)}>{showText ? "Ocultar texto" : "Ver texto completo"}</button>}
          {!doc.storagePath && !doc.extractedText && <p className="muted">Este documento no tiene archivo ni texto todavía.</p>}
        </div>
        <h3>Datos clave</h3>
        {facts.length ? (
          <dl className="technical-sheet-facts">
            {facts.map((fact) => (
              <div key={fact.key}>
                <dt>{fact.label}</dt>
                {fact.lines.map((line) => <dd key={line}>{line}</dd>)}
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted">{doc.extractedText ? "No encontré temperatura, rendimiento, densidad, tiempos ni almacenamiento escritos en esta ficha." : "Sin texto leído: no se pueden sacar datos clave (¿PDF escaneado como imagen?)."}</p>
        )}
        <p className="muted small">Copiado tal cual de la ficha. Revisá el documento antes de pasárselo a un cliente.</p>
        <h3>Productos del catálogo que la usan</h3>
        {products.length ? (
          <ul className="technical-sheet-products">
            {products.map((product) => <li key={product.id}>{product.name}{product.family ? <span className="muted small"> · {product.family}</span> : null}</li>)}
          </ul>
        ) : (
          <p className="muted">Ninguno todavía. Se vincula desde la pestaña «Qué productos tienen ficha»: en el producto, «o vincular una existente…».</p>
        )}
        {showText && <pre className="technical-sheet-text">{doc.extractedText}</pre>}
      </div>
    </div>
  );
}
