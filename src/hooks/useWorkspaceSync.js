import { useEffect, useMemo, useState } from "react";
import { CHANNELS, initialState, today } from "../app-shared";
import {
  completeTasksThrough,
  loadOnlineState,
  mergeWorkspaceState,
  onlineConfigured,
  saveOnlineState,
  supabase,
  workspaceStatesEqual,
} from "../online";
import { channelsForEmail } from "../user-channels.mjs";
import { isIgnoredWhatsAppContact } from "../whatsapp-threads.mjs";
import { findClientByWhatsApp } from "../client-contacts.mjs";

// El sufijo fuerza una única segunda pasada que también incluye las tareas
// antiguas sin fecha de vencimiento, usando su fecha de creación.
const TASKS_CLOSED_THROUGH = "2026-09-09.1";
const HISTORY_RESET_VERSION = "2026-09-03T16:00:00.000Z";

// Lógica pura de qué transformaciones aplicarle al estado recién cargado de
// Supabase antes de mostrarlo, extraída del efecto de carga para poder
// testearla sin mockear Supabase. No hace I/O: sólo decide el `nextState` y
// si hace falta re-guardarlo (el caller es quien llama a saveOnlineState).
export function reconcileLoadedWorkspaceState({ state, statusEvents }) {
  let nextState = { ...initialState, ...state, inbox: state.inbox || [] };
  let dirty = false;
  if (nextState.historyResetVersion !== HISTORY_RESET_VERSION) {
    nextState = { ...nextState, interactions: [], historyResetVersion: HISTORY_RESET_VERSION };
    dirty = true;
  }
  if ((nextState.tasksClosedThrough || "") < TASKS_CLOSED_THROUGH) {
    nextState = completeTasksThrough(nextState, TASKS_CLOSED_THROUGH);
    dirty = true;
  }
  return { nextState, dirty, statusEvents: statusEvents || [] };
}

// Lógica pura de cómo un evento entrante de WhatsApp (INSERT en tiempo real)
// modifica el workspace: si corresponde ignorarlo, a qué cliente pertenece,
// si genera un recordatorio nuevo, y cómo queda el inbox/tasks resultante.
// Extraída del listener de Supabase para poder testearla con datos simples,
// sin abrir una conexión real de tiempo real.
export function applyInboundWhatsAppEvent(current, event) {
  if (current.inbox.some((item) => item.event_id === event.event_id)) return current;
  // Un mensaje que ya se eliminó del CRM no debe resucitar solo porque
  // llega por el canal de tiempo real - este chequeo faltaba acá aunque sí
  // se aplica al cargar la bandeja completa.
  if ((current.dismissedInboxEventIds || []).includes(event.event_id)) return current;
  const ignoredRule = isIgnoredWhatsAppContact(current.ignoredWhatsAppContacts || [], event);
  const client =
    findClientByWhatsApp(current.clients, event) ||
    current.clients.find(
      (item) =>
        event.customer_name &&
        item.company?.toLowerCase() === event.customer_name.toLowerCase(),
    );
  const taskTitle = "Revisar nuevo mensaje de WhatsApp";
  const hasReminder =
    client &&
    current.tasks.some(
      (item) => item.clientId === client.id && !item.done && item.title === taskTitle,
    );
  const reminder =
    !ignoredRule && event.direction === "inbound" && client && !hasReminder
      ? {
          id: crypto.randomUUID(),
          clientId: client.id,
          company: client.company,
          title: taskTitle,
          dueDate: today(),
          cadence: "Diaria",
          priority: "Media",
          done: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          trigger: `Nuevo mensaje recibido por ${CHANNELS[event.channel]?.name || "WhatsApp"}`,
        }
      : null;
  return {
    ...current,
    inbox: [
      {
        ...event,
        classification_status: ignoredRule ? "excluded" : event.classification_status || "pending",
        excludedCategory: ignoredRule?.category,
      },
      ...current.inbox,
    ],
    tasks: reminder ? [...current.tasks, reminder] : current.tasks,
  };
}

// Todo el ciclo de vida de la sincronización online con Supabase: sesión,
// carga inicial del workspace, guardado con debounce, tiempo real (mensajes
// entrantes de WhatsApp + cambios de otros usuarios) y el estado de
// "readiness" de los canales. Se extrajo de App() tal cual estaba - mismo
// comportamiento, mismos efectos, solo agrupados en un hook para que App()
// no cargue con las 21 piezas de estado sueltas.
export function useWorkspaceSync(data, setData) {
  const [session, setSession] = useState(null);
  // channelsForEmail siempre devuelve un array nuevo: memoizarlo por email
  // evita que Dashboard/Clients/Academy (que reciben myChannels como prop)
  // pierdan su React.memo cada vez que App() re-renderiza por otro motivo.
  const email = session?.user?.email;
  const myChannels = useMemo(() => channelsForEmail(email), [email]);
  const [authReady, setAuthReady] = useState(!onlineConfigured);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    onlineConfigured ? "Conectando…" : "Modo local",
  );
  const [readiness, setReadiness] = useState(null);
  // Contadores que solo existen para poder reintentar a mano: incrementarlos
  // re-dispara el efecto de carga/guardado correspondiente sin duplicar la
  // lógica de arriba. Antes, si "Error de sincronización" aparecía, no había
  // ninguna forma de reintentar sin recargar toda la página.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [outboundStatusEvents, setOutboundStatusEvents] = useState([]);

  useEffect(() => {
    if (!onlineConfigured) return undefined;
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthReady(true);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!onlineConfigured || !session?.user?.id) {
      setRemoteReady(false);
      return undefined;
    }
    let active = true;
    setSyncStatus("Sincronizando…");
    loadOnlineState(session.user.id, myChannels)
      .then((loaded) => {
        if (!active) return;
        const { nextState, dirty, statusEvents } = reconcileLoadedWorkspaceState(loaded);
        if (dirty) {
          saveOnlineState(session.user.id, session.user.email, nextState).catch(() => {});
        }
        setData(nextState);
        setOutboundStatusEvents(statusEvents);
        setRemoteReady(true);
        setSyncStatus("Sincronizado");
      })
      .catch(() => active && setSyncStatus("Error al cargar"));

    const channel = supabase
      .channel("whatsapp-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_events" },
        ({ new: event }) => {
          if (
            event.direction !== "inbound" ||
            !myChannels.includes(event.channel) ||
            ["unread_preview", "unread_notice"].includes(event.message_type)
          )
            return;
          setData((current) => applyInboundWhatsAppEvent(current, event));
        },
      )
      .subscribe();
    const workspaceChannel = supabase
      .channel("workspace-state")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "workspace_states",
          filter: `workspace_key=eq.${session.user.id}`,
        },
        ({ new: row }) => {
          if (!row?.data) return;
          setData((current) => {
            const merged = mergeWorkspaceState(current, row.data);
            return workspaceStatesEqual(current, merged) ? current : merged;
          });
          setSyncStatus(
            `Actualizado por ${row.updated_by_email || "el equipo"}`,
          );
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(workspaceChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, loadAttempt]);

  useEffect(() => {
    if (!session?.access_token || syncStatus !== "Sincronizado") return;
    fetch("/api/readiness", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => result && setReadiness(result))
      .catch(() => setReadiness(null));
  }, [session?.access_token, syncStatus]);

  useEffect(() => {
    if (!onlineConfigured || !remoteReady || !session?.user?.id)
      return undefined;
    setSyncStatus("Guardando…");
    const timer = setTimeout(() => {
      saveOnlineState(session.user.id, session.user.email, data)
        .then((saved) => {
          // Si mientras tanto el servidor (o otra pestaña) escribió algo, el
          // guardado lo unió con lo local en vez de pisarlo: lo mostramos.
          if (saved?.merged) {
            setData((current) => {
              const next = mergeWorkspaceState(current, saved.data);
              return workspaceStatesEqual(current, next) ? current : next;
            });
          }
          setSyncStatus("Sincronizado");
        })
        .catch(() => setSyncStatus("Error de sincronización"));
    }, 700);
    return () => clearTimeout(timer);
  }, [data, remoteReady, session?.user?.id, saveAttempt]);

  // El guardado tiene un margen de 700ms (de arriba) antes de escribir a
  // Supabase - si alguien recarga o cierra la pestaña justo en ese margen
  // (ej. después de borrar varias conversaciones de "Por revisar"), ese
  // cambio nunca llega a guardarse y la próxima carga trae los datos viejos
  // sin ningún aviso. Esto avisa antes de irse mientras "Guardando…" está
  // en pantalla, para no perder ese cambio en silencio.
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (syncStatus !== "Guardando…") return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [syncStatus]);

  return {
    session,
    myChannels,
    authReady,
    remoteReady,
    syncStatus,
    readiness,
    outboundStatusEvents,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    retrySave: () => setSaveAttempt((n) => n + 1),
  };
}
