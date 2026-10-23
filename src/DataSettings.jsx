import { memo, useState } from "react";
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
import { SharedDirectory } from "./SharedDirectory.jsx";
import { AdminUsers } from "./AdminUsers.jsx";
import { DataHealth } from "./DataHealth.jsx";
import { ModuleAccessPanel } from "./ModuleAccessPanel.jsx";
import { WorkspaceCleanup } from "./WorkspaceCleanup.jsx";
import { ErrorLog } from "./ErrorLog.jsx";
import { MercadoLibreSync } from "./MercadoLibreSync.jsx";
import { ContabiliumTest } from "./ContabiliumTest.jsx";
import { AssistantTraining } from "./AssistantTraining.jsx";
import { mlCallbackParams } from "./ml-callback.mjs";
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
import { CHANNEL_ADMINS, channelsForEmail, isChannelAdmin } from "./user-channels.mjs";
import { ChannelsAdmin } from "./ChannelsAdmin";
import { CHANNELS, initialState, today } from "./app-shared";

// `data` y `session` llegan como la misma referencia mientras nadie edita
// nada acá - sin memo, cualquier otro estado ajeno de App.jsx (abrir el
// modal de tarea, tipear en el buscador de otra pantalla, el tick de
// syncStatus) volvía a renderizar todo este panel sin ningún prop distinto.
function DataSettingsBase({ data, setData, session, syncStatus, myChannels: myChannelsProp, devPanel = null }) {
  const myChannels = myChannelsProp || channelsForEmail(session?.user?.email);
  const isAdmin = isChannelAdmin(session?.user?.email);
  // Pestañas (QA 16/10: para Felipe eran ~10 paneles apilados). Cada uno ve solo las que puede usar.
  const sections = [
    ["respaldos", "Respaldos"],
    ...(onlineConfigured ? [["directorio", "Directorio"]] : []),
    ...(myChannels.length > 0 || (onlineConfigured && isAdmin) ? [["whatsapp", "WhatsApp"]] : []),
    ...(onlineConfigured && isAdmin ? [["equipo", "Equipo y cuentas"], ["conexiones", "Conexiones"], ["mercadolibre", "Mercado Libre"], ["contabilium", "Contabilium"], ["asistente", "Asistente"]] : []),
    ...((onlineConfigured && isAdmin) || devPanel ? [["errores", "Errores y pruebas"]] : []),
  ];
  const [section, setSection] = useState(() => (mlCallbackParams() ? "mercadolibre" : "respaldos"));
  const shown = sections.some(([key]) => key === section) ? section : "respaldos";
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [exportFamily, setExportFamily] = useState("Todas");
  const [pendingClientImport, setPendingClientImport] = useState(null);

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
            throw new Error([payload.error || `No se pudo activar ${channel}.`, payload.details].filter(Boolean).join(" — Meta dice: "));
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

  async function repairMetaWebhook() {
    if (!session?.access_token) return;
    setConnecting(true);
    try {
      const response = await fetch("/api/meta-subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair-webhook" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo reparar el webhook.");
      const failed = (payload.steps || []).filter((step) => !step.ok);
      showMessage(failed.length ? `Webhook reparado, pero la suscripción de General falló: ${failed.map((step) => step.error).join("; ")}` : "Listo: se volvió a suscribir General y a apuntar los mensajes al CRM. Mandá un mensaje de prueba a General.");
    } catch (error) {
      showError(error.message || "No se pudo reparar el webhook.");
    } finally {
      setConnecting(false);
    }
  }

  async function runMetaDiagnosis() {
    if (!session?.access_token) return;
    setConnecting(true);
    setDiagnosis("");
    try {
      const response = await fetch("/api/meta-subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "diagnose" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar a Meta.");
      const { ok: _ok, ...report } = payload;
      setDiagnosis(JSON.stringify(report, null, 2));
    } catch (error) {
      showError(error.message || "No se pudo consultar a Meta.");
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
      {sections.length > 1 && (
        <div className="segmented routine-tabs" role="tablist" aria-label="Secciones de Datos" style={{ width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
          {sections.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={shown === key} className={shown === key ? "selected" : ""} onClick={() => setSection(key)}>{label}</button>
          ))}
        </div>
      )}
      {message && (
        <div className={`system-message${messageIsError ? " error" : ""}`} role="status" aria-live="polite">
          {message}
        </div>
      )}
      {shown === "whatsapp" && (<>
      {myChannels.length > 0 && (
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
            <select aria-label="Número principal"
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
        {isChannelAdmin(session?.user?.email) && myChannels.length > 0 && (
          <>
            <p className="muted">
              Solo para el administrador. Volver a conectar un número ya activo puede cortar la recepción de mensajes: hacelo solo siguiendo un plan. ¿Meta dice "Sin conexión" para tu número? Conectalo acá: se abre Meta, elegís
              "conectar una cuenta existente de WhatsApp Business" y seguís los pasos. Al
              terminar, el CRM te muestra el ID del número.
            </p>
            <p>
              <button type="button" className="link-button" disabled={connecting} onClick={startWhatsAppConnection}>
                Conectar mi número con Meta
              </button>
            </p>
            <p>
              <button type="button" className="secondary" disabled={connecting} onClick={runMetaDiagnosis}>
                Diagnóstico de conexión
              </button>{" "}
              <button type="button" className="secondary" disabled={connecting} onClick={repairMetaWebhook}>
                Reparar recepción de mensajes
              </button>
            </p>
            {diagnosis && <pre className="muted" style={{ whiteSpace: "pre-wrap", userSelect: "all" }}>{diagnosis}</pre>}
          </>
        )}
      </section>
      )}
      {onlineConfigured && isChannelAdmin(session?.user?.email) && <ChannelsAdmin />}
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
      </>)}
      {shown === "equipo" && onlineConfigured && isAdmin && (<>
        <AdminUsers supabase={supabase} session={session} adminEmails={CHANNEL_ADMINS} />
        <ModuleAccessPanel supabase={supabase} />
        <WorkspaceCleanup session={session} />
      </>)}
      {shown === "conexiones" && onlineConfigured && isAdmin && <DataHealth supabase={supabase} />}
      {shown === "mercadolibre" && onlineConfigured && isAdmin && <MercadoLibreSync supabase={supabase} session={session} />}
      {shown === "contabilium" && onlineConfigured && isAdmin && <ContabiliumTest session={session} />}
      {shown === "asistente" && onlineConfigured && isAdmin && <AssistantTraining supabase={supabase} />}
      {shown === "errores" && (<>
        {onlineConfigured && isAdmin && <ErrorLog session={session} />}
        {devPanel}
      </>)}
      {shown === "directorio" && onlineConfigured && <SharedDirectory supabase={supabase} session={session} clients={data.clients || []} setClients={(clients) => setData((current) => ({ ...current, clients }))} />}
      {shown === "respaldos" && (<>
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
            <select aria-label="Familia a exportar"
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
          {/* Herramienta de prueba de la bandeja: solo Felipe la ve (16/10). */}
          {(!onlineConfigured || isChannelAdmin(session?.user?.email)) && <article>
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
          </article>}
          <article>
            <Upload size={24} />
            <h3>Fichas técnicas</h3>
            <p>
              Se suben desde Base técnica → "Subir fichas y documentos": PDF,
              Word, Excel, PowerPoint o el .md de MarkItDown, eligiendo familia
              y carpeta, con aviso si el archivo ya existe.
            </p>
          </article>
        </div>
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
      </>)}
    </div>
  );
}

export const DataSettings = memo(DataSettingsBase);
