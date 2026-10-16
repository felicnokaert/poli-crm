import { memo, useEffect, useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { Empty, Loading } from "./ui-primitives";
import { TechnicalUpload } from "./TechnicalUpload.jsx";
import { ProductSheets } from "./ProductSheets.jsx";
import { ProductQuestion } from "./ProductQuestion.jsx";
import { supabase } from "./online.js";
import { UPLOAD_ACCEPT, extensionOf } from "./document-text.mjs";
import { QUALITY_FILTERS, docProductMap, keyFacts, matchesSearch } from "./technical-insights.mjs";

const TECHNICAL_DOCUMENT_STATUS_LABELS = {
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
const BULK_SCOPES = [
  ["uploaded", "Subidos con «Subir fichas y documentos»"],
  ["empty", "Sin archivo y sin texto"],
  ["all", "Todos los documentos"],
];
const BULK_FILTERS = {
  uploaded: (doc) => doc.source === "other",
  empty: (doc) => !doc.storagePath && !String(doc.extractedText || "").trim(),
  all: () => true,
};

function TechnicalDocumentsAdminBase({ session }) {
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
  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [sheetDocId, setSheetDocId] = useState("");
  // Catálogo del cotizador y vínculos: los lee «Fichas por producto» y los pasa acá para saber qué
  // productos usa cada ficha (filtro «sin vincular» y la ficha del documento).
  const [catalog, setCatalog] = useState({ products: [], links: [] });
  const productsByDoc = useMemo(() => docProductMap(catalog.products, documents, catalog.links), [catalog, documents]);

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
      if (!url) throw new Error("Este documento todavía no tiene un archivo adjunto.");
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("");
    } catch (error) {
      setErrorMessage(error.message || "No se pudo abrir el archivo.");
    }
  }


  // Solo Felipe (RLS: "Admin elimina documentos tecnicos" - cualquier otro
  // intento lo rechaza la base, no solo esta pantalla). Es una ficha de
  // referencia compartida por todo el equipo, no algo para borrar por error.
  async function deleteDocument(doc) {
    if (!(await confirm(`¿Eliminar "${doc.title}" de Base técnica? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    await deleteDocumentsOnServer([doc], `("${doc.title}")`);
  }

  const [bulkScope, setBulkScope] = useState("uploaded");
  async function adminCall(body) {
    const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action: "technical", ...body }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo completar.");
    return result;
  }
  // Por el servidor (clave de servicio): antes se borraba desde el navegador y fallaban todos sin decir
  // por qué ("Se borraron 0. 201 no se pudieron borrar"). Ahora, si algo falla, se ve el motivo.
  // Borrado por el servidor (clave de servicio), de a 40 por pedido para que ninguno se quede sin
  // tiempo. Sirve para la tanda y para "Eliminar carpeta"; si la base rechaza algo, se muestra el motivo.
  async function deleteDocumentsOnServer(targets, label) {
    setMessageIsError(false);
    let deleted = 0;
    const errors = new Set();
    for (let index = 0; index < targets.length; index += 40) {
      setMessage(`Borrando ${Math.min(index + 40, targets.length)} de ${targets.length}…`);
      try {
        const result = await adminCall({ mode: "delete", ids: targets.slice(index, index + 40).map((doc) => doc.id) });
        deleted += result.deleted || 0;
        for (const error of result.errors || []) errors.add(error);
      } catch (error) {
        errors.add(error.message || "error del servidor");
      }
    }
    await load();
    const failed = targets.length - deleted;
    setMessage(`Se borraron ${deleted} de ${targets.length} ${label}.${failed ? ` No se pudieron borrar ${failed}. Motivo: ${[...errors].join(" · ") || "la base no devolvió detalle"}` : ""}`);
    if (failed) setMessageIsError(true);
  }
  async function deleteInBulk() {
    const targets = documents.filter(BULK_FILTERS[bulkScope]);
    const label = BULK_SCOPES.find(([key]) => key === bulkScope)?.[1] || "";
    if (!targets.length) return;
    if (!(await confirm(`Se borran ${targets.length} documento${targets.length === 1 ? "" : "s"} (${label.toLowerCase()}) con sus archivos. Esto no se puede deshacer. ¿Seguro?`, { title: "Borrar en tanda", danger: true, confirmLabel: `Borrar ${targets.length}` }))) return;
    await deleteDocumentsOnServer(targets, `(${label.toLowerCase()})`);
  }
  async function allowAllTypes() {
    setMessageIsError(false);
    setMessage("Habilitando Word, Excel, PowerPoint, texto y fotos…");
    try {
      await adminCall({ mode: "allowTypes" });
      setMessage("Listo: ya se pueden guardar Word, Excel, PowerPoint, texto y fotos. Los que quedaron sin archivo se adjuntan desde su ficha («Adjuntar archivo») o volviéndolos a subir con «Reemplazar».");
    } catch (error) {
      setErrorMessage(error.message || "No se pudo habilitar.");
    }
  }

  // Borra todas las fichas cuya carpeta (folderFromSourceFile) sea justo
  // esta - no un prefijo, para no arrastrarse una subcarpeta con nombre
  // parecido por accidente.
  async function deleteFolder(folderPath, docsInFolder) {
    if (!(await confirm(`¿Eliminar la carpeta "${folderPath}" y sus ${docsInFolder.length} ficha${docsInFolder.length === 1 ? "" : "s"}? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar carpeta" }))) return;
    await deleteDocumentsOnServer(docsInFolder, `de "${folderPath}"`);
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

  // Validar en tanda (solo Felipe): las seleccionadas pasan a «vigente» de un saque.
  function toggleSelect(docId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  }
  async function validateSelected() {
    const targets = documents.filter((doc) => selectedIds.has(doc.id) && doc.status !== "vigente");
    if (!targets.length || !isAdmin) return;
    if (!(await confirm(`Se marcan ${targets.length} documento${targets.length === 1 ? "" : "s"} como «vigente». Desde ahí el copiloto los puede citar. ¿Seguro?`, { title: "Validar en tanda", confirmLabel: `Marcar ${targets.length} vigente${targets.length === 1 ? "" : "s"}` }))) return;
    setMessageIsError(false);
    const { updateTechnicalDocumentStatus } = await import("./technical-documents-repo.mjs");
    const updated = [];
    const errors = new Set();
    for (const [index, doc] of targets.entries()) {
      setMessage(`Validando ${index + 1} de ${targets.length}…`);
      try {
        updated.push(await updateTechnicalDocumentStatus(doc.id, { status: "vigente", notes: "Validada en tanda", verifiedByUserId: session?.user?.id, verifiedByEmail: session?.user?.email }));
      } catch (error) {
        errors.add(error.message || "error");
      }
    }
    setDocuments((current) => current.map((item) => updated.find((doc) => doc.id === item.id) || item));
    setSelectedIds(new Set());
    const failed = targets.length - updated.length;
    setMessage(`Quedaron vigentes ${updated.length} de ${targets.length}.${failed ? ` No se pudieron ${failed}. Motivo: ${[...errors].join(" · ")}` : ""}`);
    if (failed) setMessageIsError(true);
  }

  const families = [...new Set(documents.map((doc) => doc.family))].sort();
  const linkedIds = useMemo(() => new Set(productsByDoc.keys()), [productsByDoc]);
  const filtered = documents.filter(
    (doc) =>
      (statusFilter === "all" || doc.status === statusFilter) &&
      (familyFilter === "all" || doc.family === familyFilter) &&
      QUALITY_FILTERS[qualityFilter][1](doc, linkedIds) &&
      matchesSearch(doc, search),
  );
  const selectedCount = documents.filter((doc) => selectedIds.has(doc.id)).length;
  const sheetDoc = documents.find((doc) => doc.id === sheetDocId);

  return (
    <div className="content-stack">
      <ProductQuestion supabase={supabase} eyebrow="Base técnica" title="Preguntale al catálogo" />
      <TechnicalUpload documents={documents} onDone={load} />
      <ProductSheets supabase={supabase} documents={documents} isAdmin={isAdmin} onChanged={load} onCatalog={setCatalog} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Catálogo compartido con el PDF adjunto</span>
            <h2>Base técnica</h2>
            <p>
              Fichas y documentos (de Drive o subidos acá arriba), con el
              archivo real guardado acá adentro. Solo Felipe puede marcar un documento "vigente" - hasta
              entonces, ninguna sugerencia del copiloto puede citarlo.
            </p>
          </div>
          <FileCheck2 size={22} />
        </div>
        {/* El aviso "X fichas no tienen su PDF" se sacó (16/10): Word, Excel y .md de MarkItDown quedan
            con su texto sin PDF, y eso está bien. Para Felipe queda el borrado en tanda. */}
        {isAdmin && documents.length > 0 && (
          <div className="technical-document-bulk-attach">
            <span>Borrar en tanda:</span>
            <select value={bulkScope} onChange={(event) => setBulkScope(event.target.value)} aria-label="Qué documentos borrar">
              {BULK_SCOPES.map(([key, label]) => <option key={key} value={key}>{label} ({documents.filter(BULK_FILTERS[key]).length})</option>)}
            </select>
            <button type="button" className="secondary" disabled={!documents.some(BULK_FILTERS[bulkScope])} onClick={deleteInBulk}>Borrar…</button>
            <button type="button" className="secondary" onClick={allowAllTypes} title="Hoy el espacio de archivos acepta solo PDF. Esto lo habilita una vez para Word, Excel, PowerPoint, texto y fotos.">Permitir Word, Excel y fotos</button>
          </div>
        )}
        <div className="list-toolbar inbox-filters">
          <input type="search" className="technical-document-search" placeholder="Buscar por nombre o código (ej. 618, MS-35)" aria-label="Buscar documento" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Revisar" value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
            {Object.entries(QUALITY_FILTERS).map(([key, [label, test]]) => (
              <option key={key} value={key}>{key === "all" ? "Todos los documentos" : `${label} (${documents.filter((doc) => test(doc, linkedIds)).length})`}</option>
            ))}
          </select>
          <select aria-label="Estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos los estados</option>
            {Object.entries(TECHNICAL_DOCUMENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select aria-label="Familia" value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
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
        {isAdmin && (
          <div className="technical-document-bulk-attach technical-document-validate-bar">
            <span>Validar en tanda: tildá las fichas revisadas.</span>
            <button type="button" className="secondary" disabled={!filtered.length} onClick={() => setSelectedIds(new Set(filtered.filter((doc) => doc.status !== "vigente").map((doc) => doc.id)))}>Tildar las {filtered.filter((doc) => doc.status !== "vigente").length} sin validar que se ven</button>
            {selectedCount > 0 && <button type="button" className="secondary" onClick={() => setSelectedIds(new Set())}>Destildar</button>}
            <button type="button" disabled={!selectedCount} onClick={validateSelected}>Marcar {selectedCount || ""} vigente{selectedCount === 1 ? "" : "s"}</button>
          </div>
        )}
        {(search || qualityFilter !== "all" || statusFilter !== "all" || familyFilter !== "all") && !loading && (
          <p className="muted small">Se ven {filtered.length} de {documents.length} documentos.</p>
        )}
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
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            openSheet={setSheetDocId}
            productsByDoc={productsByDoc}
          />
        ) : documents.length ? (
          <Empty text="Ningún documento coincide con la búsqueda o los filtros." />
        ) : (
          <Empty text="No hay documentos importados todavía. Subilas con «Subir fichas y documentos», acá arriba." />
        )}
      </section>
      {sheetDoc && <TechnicalDocumentSheet doc={sheetDoc} products={productsByDoc.get(sheetDoc.id) || []} viewFile={viewFile} onClose={() => setSheetDocId("")} />}
    </div>
  );
}

export const TechnicalDocumentsAdmin = memo(TechnicalDocumentsAdminBase);

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
          <p className="muted">Ninguno todavía. Se vincula desde «Fichas por producto»: en el producto, «o vincular una existente…».</p>
        )}
        {showText && <pre className="technical-sheet-text">{doc.extractedText}</pre>}
      </div>
    </div>
  );
}
