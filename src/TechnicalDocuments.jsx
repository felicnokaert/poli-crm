import { useEffect, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { Empty, Loading } from "./ui-primitives";

const TECHNICAL_DOCUMENT_STATUS_LABELS = {
  inventariado: "Inventariado",
  posible_duplicado: "Posible duplicado",
  pendiente_validacion: "Pendiente de validación",
  vigente: "Vigente",
  desactualizado: "Desactualizado",
  no_tecnico: "No técnico",
};

export function TechnicalDocumentsAdmin({ session }) {
  const confirm = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  // Wrapper para no repetir "setMessage + setMessageIsError(true)" en cada
  // catch: antes un error de guardado se veía exactamente igual (mismo
  // banner verde) que un éxito, así que pasaba desapercibido.
  function setErrorMessage(text) {
    setMessage(text);
    setMessageIsError(true);
  }
  const [statusFilter, setStatusFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [titleDrafts, setTitleDrafts] = useState({});
  const [groupByFolder, setGroupByFolder] = useState(true);

  async function load() {
    setLoading(true);
    setMessageIsError(false);
    try {
      const [{ fetchTechnicalDocuments }, { isTechnicalDocumentAdmin }] = await Promise.all([
        import("./technical-documents-repo.mjs"),
        import("./technical-documents-mapping.mjs"),
      ]);
      const docs = await fetchTechnicalDocuments();
      setDocuments(docs);
      setIsAdmin(isTechnicalDocumentAdmin(session?.user?.email));
    } catch (error) {
      setErrorMessage(error.message || "No se pudo cargar la base técnica.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  function draftFor(doc) {
    return drafts[doc.id] || { status: doc.status, notes: "", replacedBy: doc.replacedBy || "" };
  }
  function updateDraft(docId, patch) {
    setDrafts((current) => {
      const doc = documents.find((item) => item.id === docId);
      const base = current[docId] || { status: doc?.status || "inventariado", notes: "", replacedBy: doc?.replacedBy || "" };
      return { ...current, [docId]: { ...base, ...patch } };
    });
  }

  async function saveStatus(doc) {
    const draft = draftFor(doc);
    if (draft.status === "vigente" && !isAdmin) {
      setErrorMessage('Solo Felipe puede marcar un documento "vigente".');
      return;
    }
    setMessage("Guardando…");
    setMessageIsError(false);
    try {
      const { updateTechnicalDocumentStatus } = await import("./technical-documents-repo.mjs");
      const updated = await updateTechnicalDocumentStatus(doc.id, {
        status: draft.status,
        notes: draft.notes,
        verifiedByUserId: draft.status === "vigente" ? session?.user?.id : null,
        verifiedByEmail: draft.status === "vigente" ? session?.user?.email : null,
        replacedBy: draft.status === "desactualizado" ? draft.replacedBy || null : null,
      });
      setDocuments((current) => current.map((item) => (item.id === doc.id ? updated : item)));
      setDrafts((current) => ({ ...current, [doc.id]: { status: updated.status, notes: "", replacedBy: updated.replacedBy || "" } }));
      setMessage(`"${doc.title}" quedó en ${TECHNICAL_DOCUMENT_STATUS_LABELS[updated.status] || updated.status}.`);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo guardar el cambio de estado.");
    }
  }

  async function saveTitle(doc) {
    const nextTitle = (titleDrafts[doc.id] ?? doc.title).trim();
    if (!nextTitle || nextTitle === doc.title) return;
    setMessageIsError(false);
    try {
      const { updateTechnicalDocumentTitle } = await import("./technical-documents-repo.mjs");
      const updated = await updateTechnicalDocumentTitle(doc.id, nextTitle);
      setDocuments((current) => current.map((item) => (item.id === doc.id ? updated : item)));
      setMessage(`Nombre actualizado: "${updated.title}".`);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo renombrar el documento.");
    }
  }

  // Backfill para las fichas que ya estaban cargadas antes de que existiera
  // el adjunto real (68 al día de hoy, importadas cuando el CRM solo
  // guardaba el nombre del archivo): Felipe vuelve a elegir el mismo PDF, y
  // ahora sí queda guardado de verdad en el CRM (no solo su nombre), con el
  // texto extraído en el mismo paso.
  async function attachFile(doc, file) {
    if (!file) return;
    setMessage(`Adjuntando "${doc.title}"…`);
    setMessageIsError(false);
    try {
      const { attachTechnicalDocumentFile } = await import("./technical-documents-repo.mjs");
      const updated = await attachTechnicalDocumentFile(doc.id, file);
      setDocuments((current) => current.map((item) => (item.id === doc.id ? updated : item)));
      setMessage(
        updated.extractedText
          ? `"${doc.title}" quedó adjunta. El copiloto ya puede citarla si está vigente y validada.`
          : `"${doc.title}" quedó adjunta, pero no se pudo leer el texto (¿es un PDF escaneado como imagen?). El archivo igual se puede ver.`,
      );
    } catch (error) {
      setErrorMessage(error.message || "No se pudo adjuntar ese archivo.");
    }
  }

  async function viewFile(doc) {
    setMessage(`Abriendo "${doc.title}"…`);
    setMessageIsError(false);
    try {
      const { getTechnicalDocumentFileUrl } = await import("./technical-documents-repo.mjs");
      const url = await getTechnicalDocumentFileUrl(doc.storagePath);
      if (!url) throw new Error("Esta ficha todavía no tiene un PDF adjunto.");
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("");
    } catch (error) {
      setErrorMessage(error.message || "No se pudo abrir el archivo.");
    }
  }

  // Adjuntar de a una lleva 68 clicks - esto lo hace en un solo paso: Felipe
  // elige la carpeta local de Drive una sola vez, y cada archivo se empareja
  // con la ficha que ya tiene ese mismo camino relativo guardado en
  // source_file (mismo criterio que usó el import original). Nada se
  // reimporta ni se duplica - solo se completa lo que le faltaba.
  async function bulkAttachFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const bySourceFile = new Map();
    for (const file of files) {
      const relative = (file.webkitRelativePath || "").split("/").slice(1).join("/");
      if (relative) bySourceFile.set(relative, file);
    }
    const missingBefore = documents.filter((doc) => !doc.storagePath);
    // Las fichas cuyo archivo original es .docx/.doc nunca van a matchear
    // acá - el bucket solo acepta PDF (Felipe: "los .doc puedo verlos yo y
    // voy subiendo luego los pdf"). Avisarlo de entrada evita que parezca
    // un error cuando en realidad es esperado.
    const nonPdfCount = missingBefore.filter((doc) => !/\.pdf$/i.test(doc.sourceFile || "")).length;
    const pending = missingBefore.filter((doc) => bySourceFile.has(doc.sourceFile));
    if (!pending.length) {
      setErrorMessage(
        `Ningún archivo de esa carpeta coincide con una ficha sin PDF adjunto. Revisá que hayas elegido la carpeta "FICHAS TÉCNICAS" completa (no una de adentro).` +
        (nonPdfCount > 0 ? ` (${nonPdfCount} fichas pendientes son Word, no PDF - esas nunca van a matchear acá, hay que convertirlas primero.)` : ""),
      );
      return;
    }
    setMessage(`Adjuntando ${pending.length} de ${missingBefore.length} fichas pendientes…`);
    setMessageIsError(false);
    try {
      const { attachTechnicalDocumentFile } = await import("./technical-documents-repo.mjs");
      let firstError = "";
      const results = await Promise.all(pending.map(async (doc) => {
        try {
          return await attachTechnicalDocumentFile(doc.id, bySourceFile.get(doc.sourceFile));
        } catch (error) {
          if (!firstError) firstError = error.message || String(error);
          return null;
        }
      }));
      const succeeded = results.filter(Boolean);
      setDocuments((current) => current.map((item) => succeeded.find((updated) => updated.id === item.id) || item));
      const stillMissing = missingBefore.length - succeeded.length;
      const stillMissingNonPdf = Math.min(nonPdfCount, stillMissing);
      const stillMissingOther = stillMissing - stillMissingNonPdf;
      setMessage(
        `${succeeded.length} fichas quedaron con su PDF adjunto.` +
        (stillMissingNonPdf > 0 ? ` ${stillMissingNonPdf} son Word, no PDF - convertilas y volvé a adjuntar.` : "") +
        (stillMissingOther > 0 ? ` ${stillMissingOther} no tenían un archivo con ese mismo nombre/carpeta en lo que elegiste.` : "") +
        (stillMissing === 0 ? " No queda ninguna pendiente." : "") +
        (succeeded.length === 0 && firstError ? ` Error: ${firstError}` : ""),
      );
      if (succeeded.length === 0 && firstError) setMessageIsError(true);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo adjuntar los archivos.");
    }
  }

  // Solo Felipe (RLS: "Admin elimina documentos tecnicos" - cualquier otro
  // intento lo rechaza la base, no solo esta pantalla). Es una ficha de
  // referencia compartida por todo el equipo, no algo para borrar por error.
  async function deleteDocument(doc) {
    if (!(await confirm(`¿Eliminar "${doc.title}" de Base técnica? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setMessageIsError(false);
    try {
      const { deleteTechnicalDocument } = await import("./technical-documents-repo.mjs");
      await deleteTechnicalDocument(doc.id, doc.storagePath);
      setDocuments((current) => current.filter((item) => item.id !== doc.id));
      setMessage(`"${doc.title}" se eliminó.`);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo eliminar el documento.");
    }
  }

  // Borra todas las fichas cuya carpeta (folderFromSourceFile) sea justo
  // esta - no un prefijo, para no arrastrarse una subcarpeta con nombre
  // parecido por accidente.
  async function deleteFolder(folderPath, docsInFolder) {
    if (!(await confirm(`¿Eliminar la carpeta "${folderPath}" y sus ${docsInFolder.length} ficha${docsInFolder.length === 1 ? "" : "s"}? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar carpeta" }))) return;
    setMessageIsError(false);
    try {
      const { deleteTechnicalDocument } = await import("./technical-documents-repo.mjs");
      const ids = new Set();
      for (const doc of docsInFolder) {
        try {
          await deleteTechnicalDocument(doc.id, doc.storagePath);
          ids.add(doc.id);
        } catch {
          // sigue con el resto - un error puntual no debe dejar la carpeta a medio borrar sin aviso
        }
      }
      setDocuments((current) => current.filter((item) => !ids.has(item.id)));
      const failed = docsInFolder.length - ids.size;
      setMessage(`${ids.size} ficha${ids.size === 1 ? "" : "s"} eliminada${ids.size === 1 ? "" : "s"} de "${folderPath}".${failed > 0 ? ` ${failed} no se pudieron eliminar.` : ""}`);
      if (failed > 0) setMessageIsError(true);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo eliminar la carpeta.");
    }
  }

  // Renombrar una carpeta de verdad, como en el explorador de Windows o
  // Drive (Felipe: "poder cambiar nombre... igual que en la compu") - no
  // toca family ni ningún otro dato, solo la ruta (source_file) de cada
  // ficha que cuelga de esa carpeta, subcarpetas incluidas.
  async function renameFolderTo(folderPath, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === folderPath.split(" / ").at(-1)) return;
    setMessageIsError(false);
    try {
      const { renameFolder } = await import("./technical-documents-mapping.mjs");
      const { updateTechnicalDocumentSourceFile } = await import("./technical-documents-repo.mjs");
      const changes = renameFolder(documents, folderPath, trimmed);
      if (!changes.length) return;
      const results = await Promise.all(changes.map(async (doc) => {
        try {
          return await updateTechnicalDocumentSourceFile(doc.id, doc.sourceFile);
        } catch {
          return null;
        }
      }));
      const succeeded = results.filter(Boolean);
      setDocuments((current) => current.map((item) => succeeded.find((updated) => updated.id === item.id) || item));
      const failed = changes.length - succeeded.length;
      setMessage(`Carpeta renombrada a "${trimmed}" (${succeeded.length} ficha${succeeded.length === 1 ? "" : "s"}).${failed > 0 ? ` ${failed} no se pudieron actualizar.` : ""}`);
      if (failed > 0) setMessageIsError(true);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo renombrar la carpeta.");
    }
  }

  // Mover una ficha puntual a otra carpeta - escribiendo el nombre de una
  // carpeta que todavía no existe, "se crea" al guardar (no hay una carpeta
  // vacía sin documentos: se deriva de source_file, ver
  // technical-documents-mapping.mjs).
  async function moveDocumentToFolder(doc, newFolderPath) {
    setMessageIsError(false);
    try {
      const { moveDocumentToFolder: computeNewPath, folderFromSourceFile } = await import("./technical-documents-mapping.mjs");
      if (folderFromSourceFile(doc.sourceFile) === (newFolderPath || "Sin carpeta")) return;
      const newSourceFile = computeNewPath(doc.sourceFile, newFolderPath);
      const { updateTechnicalDocumentSourceFile } = await import("./technical-documents-repo.mjs");
      const updated = await updateTechnicalDocumentSourceFile(doc.id, newSourceFile);
      setDocuments((current) => current.map((item) => (item.id === doc.id ? updated : item)));
      setMessage(`"${doc.title}" se movió a ${newFolderPath || "la raíz"}.`);
    } catch (error) {
      setErrorMessage(error.message || "No se pudo mover la ficha.");
    }
  }

  const families = [...new Set(documents.map((doc) => doc.family))].sort();
  const missingFilesCount = documents.filter((doc) => !doc.storagePath).length;
  const filtered = documents.filter(
    (doc) =>
      (statusFilter === "all" || doc.status === statusFilter) &&
      (familyFilter === "all" || doc.family === familyFilter),
  );

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Catálogo compartido con el PDF adjunto</span>
            <h2>Base técnica</h2>
            <p>
              Documentos importados desde Drive, con su PDF real guardado acá
              adentro. Solo Felipe puede marcar un documento "vigente" - hasta
              entonces, ninguna sugerencia del copiloto puede citarlo.
            </p>
          </div>
          <FileCheck2 size={22} />
        </div>
        {missingFilesCount > 0 && (
          <div className="technical-document-bulk-attach">
            <span>
              {missingFilesCount} {missingFilesCount === 1 ? "ficha todavía no tiene" : "fichas todavía no tienen"} su PDF adjunto.
            </span>
            <label className="secondary">
              Adjuntar PDFs faltantes (elegí la carpeta completa de Drive)
              <input
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                hidden
                onChange={bulkAttachFiles}
              />
            </label>
          </div>
        )}
        <div className="list-toolbar inbox-filters">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos los estados</option>
            {Object.entries(TECHNICAL_DOCUMENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
            <option value="all">Todas las familias</option>
            {families.map((family) => (
              <option key={family}>{family}</option>
            ))}
          </select>
          <label className="technical-document-group-toggle">
            <input type="checkbox" checked={groupByFolder} onChange={(event) => setGroupByFolder(event.target.checked)} />
            Agrupar por carpeta (como en Drive)
          </label>
        </div>
        {message && (
          <div
            className={`system-message ${messageIsError ? "error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {message}
          </div>
        )}
        {loading ? (
          <Loading text="Cargando base técnica…" />
        ) : filtered.length ? (
          <TechnicalDocumentGroups
            documents={filtered}
            groupByFolder={groupByFolder}
            titleDrafts={titleDrafts}
            setTitleDrafts={setTitleDrafts}
            saveTitle={saveTitle}
            draftFor={draftFor}
            updateDraft={updateDraft}
            saveStatus={saveStatus}
            isAdmin={isAdmin}
            attachFile={attachFile}
            viewFile={viewFile}
            deleteDocument={deleteDocument}
            deleteFolder={deleteFolder}
            renameFolderTo={renameFolderTo}
            moveDocumentToFolder={moveDocumentToFolder}
          />
        ) : (
          <Empty text="No hay documentos importados todavía. Subí fichas desde Datos → Importar fichas técnicas." />
        )}
      </section>
    </div>
  );
}

export function TechnicalDocumentRow({ doc, allDocuments, titleDrafts, setTitleDrafts, saveTitle, draftFor, updateDraft, saveStatus, isAdmin, attachFile, viewFile, deleteDocument, moveDocumentToFolder }) {
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
    <article className="technical-document-row">
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
        <span className={doc.storagePath ? "technical-document-text-ok" : "technical-document-text-missing"}>
          {doc.storagePath
            ? `Ficha adjunta (PDF)${doc.extractedText ? " · el copiloto puede citarla si está vigente" : " · no se pudo leer el texto todavía"}`
            : "Sin PDF adjunto todavía · el copiloto no puede citar datos de esta ficha"}
          {" "}
          {doc.storagePath && (
            <button type="button" className="technical-document-file-link" onClick={() => viewFile(doc)}>
              Ver ficha
            </button>
          )}
          {" "}
          <label className="technical-document-file-link">
            {doc.storagePath ? "Reemplazar" : "Adjuntar PDF"}
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => attachFile(doc, event.target.files?.[0])}
            />
          </label>
        </span>
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
            <select
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
              <select
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

export function TechnicalDocumentGroups({ documents, groupByFolder, titleDrafts, setTitleDrafts, saveTitle, draftFor, updateDraft, saveStatus, isAdmin, attachFile, viewFile, deleteDocument, deleteFolder, renameFolderTo, moveDocumentToFolder }) {
  const [buildFolderTree, setBuildFolderTree] = useState(null);
  useEffect(() => {
    import("./technical-documents-mapping.mjs").then(({ buildFolderTree: fn }) => setBuildFolderTree(() => fn));
  }, []);
  const rowProps = { allDocuments: documents, titleDrafts, setTitleDrafts, saveTitle, draftFor, updateDraft, saveStatus, isAdmin, attachFile, viewFile, deleteDocument, deleteFolder, renameFolderTo, moveDocumentToFolder };
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
