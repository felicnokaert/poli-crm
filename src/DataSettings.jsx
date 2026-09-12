import { useState } from "react";
import {
  CircleAlert,
  Database,
  Download,
  Inbox,
  Link2,
  Target,
  Upload,
} from "lucide-react";
import { onlineConfigured, supabase } from "./online";
import { connectWhatsApp } from "./meta-onboarding";
import {
  buildCommercialCohort,
  mergeCommercialCohort,
} from "./commercial-cohort";
import {
  fetchCommercialMaster,
  mergeCommercialMaster,
} from "./commercial-master";
import { clientsToCsv, mergeClientsCsv } from "./client-csv.mjs";
import { readFileSmart } from "./text-decode.mjs";
import { FAMILIES } from "./families.mjs";
import { channelsForEmail } from "./user-channels.mjs";
import { CHANNELS, initialState, today } from "./app-shared";

export function DataSettings({ data, setData, session, syncStatus }) {
  const myChannels = channelsForEmail(session?.user?.email);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [exportFamily, setExportFamily] = useState("Todas");
  const [pendingClientImport, setPendingClientImport] = useState(null);
  const [technicalImportPreview, setTechnicalImportPreview] = useState(null);
  const [technicalImportBusy, setTechnicalImportBusy] = useState(false);
  const [technicalImportFamilyOverrides, setTechnicalImportFamilyOverrides] = useState({});
  const [technicalImportFiles, setTechnicalImportFiles] = useState({});

  // Un solo estado `message` servía tanto para avisos de éxito como de error,
  // sin distinción visual (todos se veían iguales) - con esto los errores se
  // resaltan con el mismo estilo `.system-message.error` que ya existe en el
  // resto de la app, en vez de perderse en un aviso neutro.
  function showMessage(text) {
    setMessageIsError(false);
    setMessage(text);
  }
  function showError(text) {
    setMessageIsError(true);
    setMessage(text);
  }

  async function importTechnicalDocuments(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setTechnicalImportBusy(true);
    setTechnicalImportPreview(null);
    setTechnicalImportFamilyOverrides({});
    try {
      const [{ sha256Hex }, { classifyInventoryImport }, { fetchTechnicalDocuments }, { parsePathHints }] =
        await Promise.all([
          import("./file-hash.mjs"),
          import("./technical-inventory-import.mjs"),
          import("./technical-documents-repo.mjs"),
          import("./technical-documents-mapping.mjs"),
        ]);
      const existing = await fetchTechnicalDocuments();
      const candidates = await Promise.all(
        files.map(async (file) => {
          // webkitRelativePath solo existe si se eligió una carpeta entera
          // (input con webkitdirectory) - conserva la estructura de Drive.
          // Con archivos sueltos, cae en el nombre nomás.
          const relativePath = file.webkitRelativePath || file.name;
          const hints = parsePathHints(relativePath);
          return {
            title: hints.title,
            family: hints.family,
            product: hints.product,
            docType: "sin_clasificar",
            source: "drive",
            sourceFile: relativePath,
            sizeBytes: file.size,
            sha256: await sha256Hex(file),
          };
        }),
      );
      // El File real se guarda aparte (no es serializable en el estado de
      // vista previa) para poder adjuntarlo recién al confirmar - Felipe
      // quiere la ficha adjunta de verdad, no solo indexada por nombre.
      setTechnicalImportFiles(Object.fromEntries(files.map((file) => [file.webkitRelativePath || file.name, file])));
      const preview = classifyInventoryImport(candidates, existing);
      setTechnicalImportPreview(preview);
      showMessage(
        `Vista previa lista: ${preview.new.length} nuevos, ${preview.modified.length} modificados, ${preview.exactDuplicates.length} duplicados exactos, ${preview.possibleDuplicates.length} posibles duplicados, ${preview.errors.length} errores. Nada se guardó todavía. Revisá la familia sugerida de cada uno antes de guardar.`,
      );
    } catch (error) {
      showError(error.message || "No se pudo analizar los archivos.");
    } finally {
      setTechnicalImportBusy(false);
    }
  }

  async function confirmTechnicalImport() {
    if (!technicalImportPreview?.new?.length) return;
    setTechnicalImportBusy(true);
    try {
      const { saveInventoryImport } = await import("./technical-documents-repo.mjs");
      const withFamily = technicalImportPreview.new.map((doc) => ({
        ...doc,
        family: technicalImportFamilyOverrides[doc.sourceFile] || doc.family,
      }));
      const saved = await saveInventoryImport(withFamily, technicalImportFiles);
      const attached = saved.filter((doc) => doc.storagePath).length;
      showMessage(
        `${saved.length} documentos guardados como "inventariado" (${attached} con su PDF adjunto y listo para que el copiloto lo lea). Ningún documento quedó "vigente" automáticamente - falta la validación humana.`,
      );
      setTechnicalImportPreview(null);
      setTechnicalImportFamilyOverrides({});
      setTechnicalImportFiles({});
    } catch (error) {
      showError(error.message || "No se pudo guardar el inventario.");
    } finally {
      setTechnicalImportBusy(false);
    }
  }

  async function startWhatsAppConnection() {
    setConnecting(true);
    showMessage("Abriendo conexión segura con Meta…");
    try {
      const result = await connectWhatsApp(session);
      showMessage(
        `WhatsApp conectado${result.phoneNumberId ? ` · Phone ID ${result.phoneNumberId}` : ""}. El CRM ya puede recibir eventos del número autorizado.`,
      );
    } catch (error) {
      showError(error.message || "No se pudo completar la conexión con Meta.");
    } finally {
      setConnecting(false);
    }
  }

  async function activateOfficialChannels() {
    if (!session?.access_token) return;
    setConnecting(true);
    showMessage(myChannels.length > 1 ? "Sincronizando tus canales…" : "Sincronizando tu WhatsApp…");
    try {
      await Promise.all(
        myChannels.map(async (channel) => {
          const response = await fetch("/api/meta-subscribe", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel }),
          });
          const payload = await response.json();
          if (!response.ok)
            throw new Error(payload.error || `No se pudo activar ${channel}.`);
          return payload.channel;
        }),
      );
      showMessage("Listo. Si igual no te llegan mensajes, revisá en el Business Manager de Meta que el número tenga activada la coexistencia.");
    } catch (error) {
      showError(
        error.message || "No se pudo sincronizar. Probá de nuevo en un momento.",
      );
    } finally {
      setConnecting(false);
    }
  }

  // La cartera maestra y la cohorte prioritaria son datos de General
  // (Poliuretano, PURMAC, Carrozados, Resinplast) - no le pertenecen a
  // Penosil ni a Juan. Sin este chequeo, cualquier cuenta podía mezclar la
  // cartera de otra unidad de negocio en su propio workspace sin querer.
  function importCommercialCohort() {
    if (!myChannels.includes('general')) return;
    const cohort = buildCommercialCohort();
    const result = mergeCommercialCohort(data);
    setData(result.state);
    showMessage(
      `Cohorte comercial verificada: ${result.addedClients} clientes y ${result.addedTasks} tareas nuevas. ${cohort.clients.length - result.addedClients} cuentas existentes fueron preservadas sin cambios.`,
    );
  }

  async function importCommercialMaster() {
    if (!myChannels.includes('general')) return;
    setConnecting(true);
    try {
      const clients = await fetchCommercialMaster(session);
      const result = mergeCommercialMaster(data, clients);
      setData(result.state);
      showMessage(
        result.skipped
          ? "La cartera maestra ya está incorporada. Tus ediciones quedan preservadas."
          : `Cartera consolidada: ${result.addedClients} fichas nuevas y ${result.enrichedClients} fichas enriquecidas, sin crear tareas masivas.`,
      );
    } catch (error) {
      showError(error.message || "No se pudo cargar la cartera protegida.");
    } finally {
      setConnecting(false);
    }
  }

  function exportBackup() {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      channels: CHANNELS,
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `poliplast-sales-copilot-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showMessage("Respaldo exportado correctamente.");
  }

  function exportClients() {
    const clients =
      exportFamily === "Todas"
        ? data.clients
        : data.clients.filter(
            (client) => (client.family || "Sin definir") === exportFamily,
          );
    const blob = new Blob([clientsToCsv(clients)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clientes-${exportFamily === "Todas" ? "todos" : exportFamily.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showMessage(
      `CSV exportado: ${clients.length} fichas${exportFamily === "Todas" ? "" : ` de ${exportFamily}`}.`,
    );
  }

  async function importClients(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = mergeClientsCsv(data.clients, await readFileSmart(file));
      setPendingClientImport({ ...result, fileName: file.name });
      showMessage(
        `Vista previa lista: ${result.added} empresas nuevas, ${result.updated} actualizadas y ${result.skipped} filas omitidas. Todavía no se guardó nada.`,
      );
    } catch (error) {
      showError(error.message || "No se pudo importar el CSV.");
    } finally {
      event.target.value = "";
    }
  }

  function confirmClientImport() {
    if (!pendingClientImport) return;
    setData({ ...data, clients: pendingClientImport.clients });
    const duplicateNote = pendingClientImport.duplicatePhones?.length
      ? ` ${pendingClientImport.duplicatePhones.length} teléfonos compartidos quedaron señalados para revisión, sin fusionarse.`
      : "";
    showMessage(
      `CSV incorporado: ${pendingClientImport.added} empresas nuevas, ${pendingClientImport.updated} actualizadas y ${pendingClientImport.skipped} filas omitidas.${duplicateNote}`,
    );
    setPendingClientImport(null);
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload.schemaVersion !== 1 ||
        !payload.data?.clients ||
        !payload.data?.interactions ||
        !payload.data?.tasks
      )
        throw new Error("Formato inválido");
      setData({
        ...initialState,
        ...payload.data,
        inbox: payload.data.inbox || [],
      });
      showMessage(
        `Respaldo importado: ${payload.data.clients.length} clientes y ${payload.data.interactions.length} conversaciones.`,
      );
    } catch {
      showError(
        "No se pudo importar: el archivo no corresponde a un respaldo válido.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function importWebhookEvents(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = Array.isArray(payload) ? payload : payload.events;
      if (!Array.isArray(incoming)) throw new Error("Formato inválido");
      const known = new Set(data.inbox.map((item) => item.event_id));
      const valid = incoming.filter(
        (item) =>
          item.event_id &&
          !known.has(item.event_id) &&
          item.direction !== "status",
      );
      setData({
        ...data,
        inbox: [
          ...valid.map((item) => ({
            ...item,
            classification_status: item.classification_status || "pending",
          })),
          ...data.inbox,
        ],
      });
      showMessage(
        `${valid.length} mensajes nuevos incorporados a la bandeja; ${incoming.length - valid.length} duplicados o eventos de sistema omitidos.`,
      );
    } catch {
      showError(
        "No se pudo importar: se esperaba un arreglo de eventos normalizados del webhook.",
      );
    } finally {
      event.target.value = "";
    }
  }

  const clientFamilies = [
    "Todas",
    ...new Set(data.clients.map((client) => client.family || "Sin definir")),
  ];
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Tu perfil</span>
            <h2>Tu WhatsApp</h2>
          </div>
          <Link2 size={20} />
        </div>
        {myChannels.length > 1 ? (
          <label className="whatsapp-number-row">
            <select
              value={myChannels.includes(data.primaryChannel) ? data.primaryChannel : myChannels[0]}
              onChange={(event) => setData({ ...data, primaryChannel: event.target.value })}
            >
              {myChannels.map((key) => (
                <option value={key} key={key}>{CHANNELS[key]?.name || key}</option>
              ))}
            </select>
            <button className="secondary" disabled={connecting} onClick={activateOfficialChannels}>
              Sincronizar
            </button>
          </label>
        ) : (
          <p className="whatsapp-number-row">
            <strong>{CHANNELS[myChannels[0]]?.number || CHANNELS[myChannels[0]]?.name}</strong>
            <button className="secondary" disabled={connecting} onClick={activateOfficialChannels}>
              Sincronizar
            </button>
          </p>
        )}
        {message && (
          <div className={`system-message${messageIsError ? " error" : ""}`}>
            {message}
          </div>
        )}
        {myChannels.length > 1 && (
          <button type="button" className="link-button" disabled={connecting} onClick={startWhatsAppConnection}>
            + Conectar un número nuevo
          </button>
        )}
      </section>
      {myChannels.includes('general') && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Base de trabajo protegida</span>
              <h2>Cartera comercial unificada</h2>
            </div>
            <Target size={22} />
          </div>
          <p>
            Clientes históricos, relevamientos y empresas objetivo deduplicados.
            La cartera solo se descarga después de validar un usuario corporativo
            y se incorpora como fichas editables, sin crear tareas masivas. Es
            la cartera de General - no aparece para Penosil ni para Juan, para
            no mezclar unidades de negocio sin querer.
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={connecting}
              type="button"
              onClick={importCommercialMaster}
            >
              Verificar cartera maestra
            </button>
            <button
              className="secondary"
              type="button"
              onClick={importCommercialCohort}
            >
              Verificar cohorte prioritaria
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Portabilidad</span>
            <h2>Datos y respaldos</h2>
          </div>
          <Database size={22} />
        </div>
        <div className="data-cards">
          <article>
            <Download size={24} />
            <h3>Exportar contactos CSV</h3>
            <p>
              Descargá toda la cartera o una familia. Cada persona o teléfono
              ocupa una fila y conserva su empresa.
            </p>
            <select
              value={exportFamily}
              onChange={(event) => setExportFamily(event.target.value)}
            >
              {clientFamilies.map((family) => (
                <option key={family}>{family}</option>
              ))}
            </select>
            <button className="primary" onClick={exportClients}>
              Descargar CSV
            </button>
          </article>
          <article>
            <Upload size={24} />
            <h3>Importar clientes CSV</h3>
            <p>
              Primero muestra una vista previa. Deduplica por CUIT y empresa;
              nunca fusiona en silencio un teléfono compartido.
            </p>
            <label className="secondary upload-button">
              Analizar CSV
              <input
                type="file"
                accept="text/csv,.csv"
                onChange={importClients}
              />
            </label>
          </article>
          <article>
            <Download size={24} />
            <h3>Respaldo integral</h3>
            <p>
              Descarga clientes, conversaciones, tareas, evaluaciones y bandeja
              en JSON.
            </p>
            <button className="secondary" onClick={exportBackup}>
              Descargar JSON
            </button>
            <label className="secondary upload-button">
              Restaurar JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={importBackup}
              />
            </label>
          </article>
          <article>
            <Inbox size={24} />
            <h3>Importar eventos WhatsApp</h3>
            <p>
              Prueba la bandeja con eventos normalizados. Deduplica por ID y
              omite estados técnicos.
            </p>
            <label className="secondary upload-button">
              Elegir eventos
              <input
                type="file"
                accept="application/json,.json"
                onChange={importWebhookEvents}
              />
            </label>
          </article>
          <article>
            <Upload size={24} />
            <h3>Importar fichas técnicas</h3>
            <p>
              Elegí una carpeta entera (conserva la estructura de Drive, sirve
              para sugerir familia y producto) o archivos sueltos. Muestra
              vista previa (nuevos, modificados, duplicados exactos, posibles
              duplicados, errores) antes de guardar - nada queda "vigente"
              automáticamente. La familia sugerida se puede corregir por
              archivo antes de guardar, no hace falta que todo el lote sea de
              la misma.
            </p>
            <div className="modal-actions">
              <label className="secondary upload-button">
                {technicalImportBusy ? "Analizando…" : "Elegir carpeta"}
                <input
                  type="file"
                  webkitdirectory=""
                  directory=""
                  disabled={technicalImportBusy}
                  onChange={importTechnicalDocuments}
                />
              </label>
              <label className="secondary upload-button">
                {technicalImportBusy ? "Analizando…" : "Elegir archivos sueltos"}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  disabled={technicalImportBusy}
                  onChange={importTechnicalDocuments}
                />
              </label>
            </div>
          </article>
        </div>
        {technicalImportPreview && (
          <div className="import-preview">
            <strong>Vista previa de fichas técnicas</strong>
            {technicalImportPreview.new.length > 0 && (
              <div>
                <span className="copilot-suggestion-label">
                  Nuevos ({technicalImportPreview.new.length}) - revisá la familia de cada uno
                </span>
                <ul className="technical-import-new-list">
                  {technicalImportPreview.new.map((doc) => (
                    <li key={doc.sourceFile}>
                      <span>{doc.title}</span>
                      <select
                        value={technicalImportFamilyOverrides[doc.sourceFile] || doc.family}
                        onChange={(event) =>
                          setTechnicalImportFamilyOverrides((current) => ({
                            ...current,
                            [doc.sourceFile]: event.target.value,
                          }))
                        }
                      >
                        {FAMILIES.filter((item) => item !== "Sin definir").map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {technicalImportPreview.modified.length > 0 && (
              <div>
                <span className="copilot-suggestion-label">
                  Modificados ({technicalImportPreview.modified.length}) - no se reemplazan solos
                </span>
                <ul>
                  {technicalImportPreview.modified.map((entry) => (
                    <li key={entry.candidate.sourceFile}>
                      {entry.candidate.title} — ya existe como "{entry.existing.title}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {technicalImportPreview.exactDuplicates.length > 0 && (
              <div>
                <span className="copilot-suggestion-label">
                  Duplicados exactos ({technicalImportPreview.exactDuplicates.length})
                </span>
                <ul>
                  {technicalImportPreview.exactDuplicates.map((entry) => (
                    <li key={entry.candidate.sourceFile}>
                      {entry.candidate.sourceFile} = {entry.existing.sourceFile || entry.existing.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {technicalImportPreview.possibleDuplicates.length > 0 && (
              <div>
                <span className="copilot-suggestion-label">
                  Posibles duplicados ({technicalImportPreview.possibleDuplicates.length}) - a revisar a mano
                </span>
                <ul>
                  {technicalImportPreview.possibleDuplicates.map((entry) => (
                    <li key={entry.candidate.sourceFile}>{entry.candidate.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {technicalImportPreview.errors.length > 0 && (
              <div>
                <span className="copilot-suggestion-label">
                  Errores ({technicalImportPreview.errors.length})
                </span>
                <ul>
                  {technicalImportPreview.errors.map((entry, index) => (
                    <li key={index}>
                      {entry.candidate?.sourceFile || entry.candidate?.title || "(sin nombre)"} — {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setTechnicalImportPreview(null)}
              >
                Descartar vista previa
              </button>
              <button
                className="primary"
                type="button"
                disabled={!technicalImportPreview.new.length || technicalImportBusy}
                onClick={confirmTechnicalImport}
              >
                Guardar {technicalImportPreview.new.length} nuevos como "inventariado"
              </button>
            </div>
          </div>
        )}
        {pendingClientImport && (
          <div className="import-preview">
            <strong>Vista previa · {pendingClientImport.fileName}</strong>
            <p>
              {pendingClientImport.added} empresas nuevas ·{" "}
              {pendingClientImport.updated} actualizadas ·{" "}
              {pendingClientImport.skipped} filas omitidas ·{" "}
              {pendingClientImport.duplicatePhones?.length || 0} teléfonos
              compartidos para revisar.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setPendingClientImport(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                onClick={confirmClientImport}
              >
                Confirmar importación
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              {onlineConfigured ? "Estado online" : "Estado local"}
            </span>
            <h2>Contenido guardado</h2>
          </div>
        </div>
        <div className="storage-summary">
          <div>
            <strong>{data.clients.length}</strong>
            <span>Empresas</span>
          </div>
          <div>
            <strong>{data.interactions.length}</strong>
            <span>Conversaciones</span>
          </div>
          <div>
            <strong>{data.tasks.length}</strong>
            <span>Tareas</span>
          </div>
          <div>
            <strong>
              {
                data.inbox.filter(
                  (item) => item.classification_status === "pending",
                ).length
              }
            </strong>
            <span>Conversaciones WhatsApp pendientes</span>
          </div>
        </div>
        <div className="quality-note">
          <CircleAlert size={19} />
          <p>
            {onlineConfigured
              ? `${syncStatus}. Usuario: ${session?.user?.email || "sin identificar"}. Los cambios se guardan online y siguen teniendo respaldo local.`
              : "Modo local de prueba. Exportá un respaldo al terminar cada jornada; al configurar la base, el mismo CRM activará acceso y sincronización online."}
          </p>
        </div>
        {onlineConfigured && (
          <button
            className="secondary signout"
            onClick={() => supabase.auth.signOut()}
          >
            Cerrar sesión
          </button>
        )}
      </section>
    </div>
  );
}
