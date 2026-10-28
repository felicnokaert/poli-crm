import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { Splash, PoliplastMark } from "./ui-primitives";
import {
  blankInteraction,
  blankTask,
  commercialOutcome,
  commercialStage,
  initialState,
  today,
} from "./app-shared";
import { Tasks, TaskDetail, TaskForm } from "./Tasks";
const TechnicalDocumentsAdmin = lazy(() =>
  import("./TechnicalDocuments").then((m) => ({ default: m.TechnicalDocumentsAdmin }))
);
const MapaCobertura = lazy(() => import("./MapaCobertura").then((m) => ({ default: m.MapaCobertura })));
const CotizadorFrame = lazy(() => import("./CotizadorFrame").then((m) => ({ default: m.CotizadorFrame })));
// Único de los cinco named exports de Academy.jsx que se usa acá - los
// otros (CommercialKnowledge, Coach, QuickReplies, Training) son internos,
// consumidos solo por el propio <Academy> - así que separarla en su propio
// chunk no arrastra nada que este archivo necesite.
const ImprovementCenter = lazy(() => import("./ImprovementCenter").then((m) => ({ default: m.ImprovementCenter })));
const ShopifyBoard = lazy(() => import("./ShopifyBoard").then((m) => ({ default: m.ShopifyBoard })));
const MercadoLibreBoard = lazy(() => import("./MercadoLibreBoard").then((m) => ({ default: m.MercadoLibreBoard })));
const Academy = lazy(() => import("./Academy").then((m) => ({ default: m.Academy })));
import { LoginScreen } from "./Login";
import { canSeeWeeklySummary } from "./weekly-summary.mjs";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
const DataSettings = lazy(() => import("./DataSettings").then((m) => ({ default: m.DataSettings })));
import { InteractionDetail } from "./Interactions";
import { Dashboard } from "./Dashboard";
import { useCronStatus } from "./hooks/useCronStatus";
import { useWhatsAppHealth } from "./hooks/useWhatsAppHealth";
import { shouldShowWelcome } from "./weekly-targets.mjs";
import {
  onlineConfigured,
  supabase,
} from "./online";
import { makeRequestsApi } from "./prospect-requests.mjs";
import { planTasks } from "./trello-plan-import.mjs";
import { applyTrelloUpdates } from "./trello-json-import.mjs";
import { mlCallbackParams } from "./ml-callback.mjs";
import { isChannelAdmin } from "./user-channels.mjs";
import { readTheme } from "./theme.mjs";
import { canSeeRapypMap, ownsFelipeTools } from "./personal-tools.mjs";
const Sales = lazy(() => import("./Sales"));
// Vistas y modales que no se ven al abrir la app (la entrada es Hoy/dashboard):
// cada una va a su propio chunk y se baja al entrar por primera vez. Login,
// Dashboard, Tasks e Interactions quedan estáticos porque Dashboard y
// ClientDetail los comparten (TaskList, InteractionRow).
const lazyNamed = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const Clients = lazyNamed(() => import("./Clients"), "Clients");
const Prospeccion = lazyNamed(() => import("./Prospeccion"), "Prospeccion");
const Contacts = lazyNamed(() => import("./Clients"), "Contacts");
const Conversations = lazyNamed(() => import("./Conversations"), "Conversations");
const WhatsAppInbox = lazyNamed(() => import("./WhatsAppInbox"), "WhatsAppInbox");
const Profile = lazyNamed(() => import("./Settings"), "Profile");
const TestCleanupPanel = lazyNamed(() => import("./Settings"), "TestCleanupPanel");
const InteractionForm = lazyNamed(() => import("./InteractionForm"), "InteractionForm");
const InboxDraftModal = lazyNamed(() => import("./InboxComponents"), "InboxDraftModal");
const ClientDetail = lazyNamed(() => import("./ClientDetail"), "ClientDetail");
const CommandPalette = lazyNamed(() => import("./CommandPalette"), "CommandPalette");
const ShortcutsHelp = lazyNamed(() => import("./ShortcutsHelp"), "ShortcutsHelp");
import {
  clientSearchText,
} from "./client-contacts.mjs";
import { shouldCreateFollowup } from "./followup-policy.mjs";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import { useSharedNotesSync } from "./hooks/useSharedNotesSync";
import { useSelectedRecords } from "./hooks/useSelectedRecords";
import { postponeTask } from "./day-review.mjs";
import { useNavGroups } from "./hooks/useNavGroups";
import { useSalesActions } from "./hooks/useSalesActions";
import { useInboxActions } from "./hooks/useInboxActions";
import { useRapypClients } from "./hooks/useRapypClients";
import { useClientActions } from "./hooks/useClientActions";
import { AppSidebar, NAV_ITEMS } from "./AppSidebar.jsx";
import { canSee as canSeeModule, firstAllowedView } from "./module-access.mjs";
import { useModuleAccess } from "./hooks/useModuleAccess.js";
import { AppTopbar } from "./AppTopbar.jsx";
import { AssistantButton } from "./AssistantButton.jsx";

// "Registrar conversación" solo tiene sentido donde se sigue a un cliente
// puntual, no en todos los módulos.
// Referencia estable para props tipo array que suelen venir undefined (ej.
// data.mergeLogs / data.duplicateReviewDecisions antes de la primera fusión):
// usar "|| []" inline crearía un array nuevo en cada render de App() y
// rompería el React.memo de <Clients>, que recibe estas props.
const EMPTY_ARRAY = [];

const LOG_CONVERSATION_VIEWS = ["conversations"];

const STORAGE_KEY = "poliplast-sales-copilot-v1";
// Mismos 6 grupos que arma navGroups más abajo - repetidos acá porque hacen
// falta antes de que el componente pueda armar navGroups (son el estado
// inicial "todo colapsado").
const NAV_GROUP_NAMES = ["Hoy", "Ventas", "Canales online", "Cartera", "Aprender", "Más"];

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored
      ? { ...initialState, ...stored, inbox: stored.inbox || [] }
      : initialState;
  } catch {
    return initialState;
  }
}

const VIEW_KEY = "poliplast-current-view";
const SAVED_VIEWS = new Set(["dashboard", "conversations", "inbox", "tasks", "sales", "clients", "prospecting", "mercadolibre", "shopify", "mejoras", "academy", "quoter", "map", "techdocs", "profile", "settings"]);
function readSavedView() {
  try {
    const saved = sessionStorage.getItem(VIEW_KEY);
    return SAVED_VIEWS.has(saved) ? saved : "dashboard";
  } catch { return "dashboard"; }
}

export default function App() {
  const [narrowScreen, setNarrowScreen] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return undefined;
    const onChange = (event) => setNarrowScreen(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const prospectRequests = useMemo(() => makeRequestsApi(supabase), []);
  const confirm = useConfirm();
  const [data, setData] = useState(loadState);
  const {
    session,
    myChannels,
    authReady,
    remoteReady,
    syncStatus,
    readiness,
    outboundStatusEvents,
    retryLoad,
    retrySave,
  } = useWorkspaceSync(data, setData);
  const cronStatus = useCronStatus(session);
  const whatsappHealth = useWhatsAppHealth(session);
  // 23/10: lo que anota cada uno se comparte para que el asistente y el resumen aprendan de todo el equipo.
  useSharedNotesSync(onlineConfigured && session ? supabase : null, session?.user?.email, String(session?.user?.user_metadata?.full_name || ""), data, Boolean(remoteReady));
  // Al volver de autorizar Mercado Libre se abre Más → Datos → Mercado Libre para terminar la conexión.
  // Al recargar (F5) se queda en el módulo donde estaba (21/10, pedido de Felipe). Se guarda por pestaña:
  // una pestaña nueva arranca en Inicio.
  const [pickedView, setView] = useState(() => (mlCallbackParams() ? "settings" : readSavedView()));
  const deniedModules = useModuleAccess(supabase, session?.user?.email, Boolean(onlineConfigured && session));
  // Si a esta cuenta le quitaron la pantalla (guardada o abierta desde un atajo), cae en la primera que sí puede ver.
  const view = canSeeModule(session?.user?.email, deniedModules, pickedView) ? pickedView : firstAllowedView(session?.user?.email, deniedModules);
  useEffect(() => { try { sessionStorage.setItem(VIEW_KEY, view); } catch { /* sin almacenamiento */ } }, [view]);
  const [mapTab, setMapTab] = useState("aplicadores");
  // Empresa con la que se abre el cotizador (desde "Cotizar" en la ficha); null = cotización libre.
  const [quoterClient, setQuoterClient] = useState(null);
  const [collapsedNavGroups, setCollapsedNavGroups] = useNavGroups(NAV_GROUP_NAMES);
  const [showForm, setShowForm] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [clientsTab, setClientsTab] = useState("empresas");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(blankTask);
  const [editingInteractionId, setEditingInteractionId] = useState(null);
  const [form, setForm] = useState(blankInteraction);
  const [inboxDraft, setInboxDraft] = useState(null);
  const [query, setQuery] = useState("");
  const {
    selectedInteractionId,
    setSelectedInteractionId,
    selectedClientId,
    setSelectedClientId,
    selectedTaskId,
    setSelectedTaskId,
  } = useSelectedRecords();
  const openTaskForm = useCallback(() => setShowTaskForm(true), []);
  const searchInputRef = useRef(null);
  const hasOpenModal =
    showForm ||
    showTaskForm ||
    showShortcutsHelp ||
    showPalette ||
    Boolean(inboxDraft) ||
    Boolean(selectedInteractionId) ||
    Boolean(selectedClientId) ||
    Boolean(selectedTaskId);

  useEffect(() => {
    function handleGlobalShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowPalette(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = document.activeElement;
      const isTyping =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) ||
        target?.isContentEditable;
      if (event.key === "/" && !isTyping) {
        if (searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
        }
        return;
      }
      if (event.key === "n" && !isTyping && !hasOpenModal) {
        event.preventDefault();
        openTaskForm();
      }
    }
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [hasOpenModal, openTaskForm]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // Lo que el asistente puede leer de tu espacio de trabajo (21/10): tareas, ventas, historial y prospectos.
  const assistantWorkspace = useMemo(() => ({
    tasks: data.tasks || EMPTY_ARRAY,
    sales: data.sales || EMPTY_ARRAY,
    interactions: data.interactions || EMPTY_ARRAY,
    prospects: data.prospects || EMPTY_ARRAY,
  }), [data.tasks, data.sales, data.interactions, data.prospects]);

  // Lo que el asistente propone y la persona confirma (22/10): crear una tarea o anotar en la ficha de un
  // cliente. Mandar mensajes no existe: el CRM solo recibe.
  const assistantAction = useCallback((action) => {
    const input = action?.input || {};
    const stamp = new Date().toISOString();
    const plainName = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const findClient = (clients, name) => {
      const wanted = plainName(name);
      if (!wanted) return null;
      return clients.find((client) => plainName(client.company) === wanted)
        || clients.find((client) => plainName(client.company).includes(wanted) || wanted.includes(plainName(client.company)));
    };
    if (action?.kind === "crear_tarea") {
      if (!String(input.titulo || "").trim()) return { ok: false, error: "Falta qué hay que hacer." };
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.fecha || "")) ? input.fecha : today();
      setData((current) => {
        const client = findClient(current.clients || [], input.empresa);
        return { ...current, tasks: [...(current.tasks || []), {
          ...blankTask(), id: crypto.randomUUID(), clientId: client?.id || "", company: client?.company || String(input.empresa || "").trim() || "Sin empresa",
          title: String(input.titulo).trim(), dueDate, priority: ["Alta", "Media", "Baja"].includes(input.prioridad) ? input.prioridad : "Media",
          source: "asistente", done: false, createdAt: stamp, updatedAt: stamp,
        }] };
      });
      return { ok: true };
    }
    if (action?.kind === "anotar_en_cliente") {
      const client = findClient(data.clients || [], input.empresa);
      if (!client) return { ok: false, error: `No encontré "${input.empresa}" en la cartera.` };
      const line = `${today().split("-").reverse().join("/")}: ${String(input.nota || "").trim()}`;
      setData((current) => ({ ...current, clients: (current.clients || []).map((item) => (item.id === client.id
        ? { ...item, notes: [String(item.notes || "").trim(), line].filter(Boolean).join("\n"), updatedAt: stamp } : item)) }));
      return { ok: true };
    }
    return { ok: false, error: "Esa acción no existe." };
  }, [data.clients]);

  const metrics = useMemo(() => {
    const now = today();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recent = data.interactions.filter(
      (item) => new Date(item.createdAt) >= weekAgo,
    );
    return {
      clients: data.clients.length,
      contacts: recent.length,
      effective: recent.filter((item) => item.need || item.contact).length,
      proposals: (data.opportunities || []).filter((item) =>
        ["Cotización", "Negociación"].includes(item.stage),
      ).length,
      wins: (data.opportunities || []).filter((item) => item.stage === "Ganada")
        .length,
      overdue: data.tasks.filter((task) => !task.done && task.kind !== "evento" && task.dueDate < now)
        .length,
      dueToday: data.tasks.filter((task) => !task.done && task.dueDate === now)
        .length,
    };
  }, [data]);

  // Memoizado: es la prop `clients` de <Clients>, que ahora está envuelto en
  // React.memo - sin esto se calculaba un array nuevo en cada render de
  // App() (ej. al tipear en el buscador de otra pantalla, o al tick de
  // syncStatus) y el memo nunca evitaba nada.
  const filteredClients = useMemo(
    () =>
      data.clients.filter((client) =>
        clientSearchText(client).toLowerCase().includes(query.toLowerCase()),
      ),
    [data.clients, query],
  );

  function saveInteraction(event) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const editingInteraction = editingInteractionId
      ? data.interactions.find((item) => item.id === editingInteractionId)
      : null;
    const existing =
      data.clients.find(
        (client) => client.id === editingInteraction?.clientId,
      ) ||
      data.clients.find(
        (client) =>
          client.company.toLowerCase() === form.company.trim().toLowerCase(),
      );
    const clientId = existing?.id || crypto.randomUUID();
    const client = {
      id: clientId,
      company: form.company.trim(),
      contact: form.contact.trim(),
      family: form.family,
      currentIntent: form.intent,
      temperature: existing?.temperature || form.temperature || "Tibio",
      stage: commercialStage(form.stage),
      outcome: form.outcome || commercialOutcome(existing),
      clientType: form.clientType,
      industry: form.industry,
      fit: form.fit,
      urgency: form.urgency,
      potential: form.potential,
      currentSupplier: form.currentSupplier,
      decisionMaker: form.decisionMaker,
      lossReason: form.lossReason,
      repurchaseTrigger: form.repurchaseTrigger,
      repurchaseDate: form.repurchaseDate,
      pipelineActive: true,
      lastContact: today(),
      updatedAt: stamp,
    };
    const interaction = {
      ...editingInteraction,
      ...form,
      stage: commercialStage(form.stage),
      temperature: existing?.temperature || form.temperature || "Tibio",
      id: editingInteraction?.id || crypto.randomUUID(),
      clientId,
      createdAt: editingInteraction?.createdAt || stamp,
      updatedAt: stamp,
    };
    const tasks =
      !editingInteraction && shouldCreateFollowup(form)
        ? [
            ...data.tasks,
            {
              id: crypto.randomUUID(),
              clientId,
              company: client.company,
              title: form.nextAction.trim(),
              dueDate: form.nextDate,
              cadence: "Diaria",
              priority: (existing?.temperature || form.temperature) === "Caliente" ? "Alta" : "Media",
              done: false,
              createdAt: stamp,
              updatedAt: stamp,
            },
          ]
        : data.tasks;
    setData({
      ...data,
      clients: existing
        ? data.clients.map((item) =>
            item.id === clientId ? { ...item, ...client } : item,
          )
        : [...data.clients, client],
      interactions: editingInteraction
        ? data.interactions.map((item) =>
            item.id === interaction.id ? interaction : item,
          )
        : [interaction, ...data.interactions],
      tasks,
    });
    setForm(blankInteraction());
    setEditingInteractionId(null);
    setShowForm(false);
  }

  const editInteraction = useCallback((interaction) => {
    setForm({ ...blankInteraction(), ...interaction });
    setEditingInteractionId(interaction.id);
    setSelectedInteractionId(null);
    setShowForm(true);
  }, [setSelectedInteractionId]);

  function closeInteractionForm() {
    setForm(blankInteraction());
    setEditingInteractionId(null);
    setShowForm(false);
  }

  function startClientInteraction(client) {
    setForm({
      ...blankInteraction(),
      company: client.company,
      contact: client.contact || "",
      family: client.family || "Sin definir",
      temperature: client.temperature || "Tibio",
      stage: commercialStage(client.stage),
      clientType: client.clientType || "Desconocido",
      industry: client.industry || "Desconocida",
      fit: client.fit || "A confirmar",
      urgency: client.urgency || "A confirmar",
      potential: client.potential || "Hipótesis media",
      currentSupplier: client.currentSupplier || "",
      decisionMaker: client.decisionMaker || "",
      repurchaseTrigger: client.repurchaseTrigger || "",
      repurchaseDate: client.repurchaseDate || "",
    });
    setSelectedClientId(null);
    setShowForm(true);
  }

  function startClientTask(client) {
    setTaskForm({
      ...blankTask(),
      clientId: client.id,
      company: client.company,
    });
    setSelectedClientId(null);
    setShowTaskForm(true);
  }

  const dismissWelcome = useCallback(() => {
    setData((current) => ({ ...current, welcomeDismissed: true }));
  }, [setData]);
  const openNewInteractionForm = useCallback(() => setShowForm(true), []);

  const addEvent = useCallback((form) => {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: [...(current.tasks || []), {
        id: crypto.randomUUID(), clientId: "", company: form.company || "", title: form.title, dueDate: form.date,
        startTime: form.startTime, endTime: form.endTime || "", place: form.place || "", kind: "evento",
        cadence: "Única", priority: "Media", done: false, createdAt: stamp, updatedAt: stamp,
      }],
    }));
  }, []);

  // El plan Trello de Felipe se descarga solo en su cuenta (ver el efecto que llena trelloPlan).
  const [trelloPlan, setTrelloPlan] = useState([]);
  const importTrelloPlan = useCallback(() => {
    setData((current) => {
      const added = planTasks(trelloPlan, current.tasks);
      return added.length ? { ...current, tasks: [...(current.tasks || []), ...added] } : current;
    });
  }, [trelloPlan]);
  const importTrelloTasks = useCallback((added, updates = []) => {
    setData((current) => ({ ...current, tasks: [...applyTrelloUpdates(current.tasks || [], updates), ...added] }));
  }, []);

  const postponeTaskTo = useCallback((id, toDate) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? postponeTask(task, toDate) : task)),
    }));
  }, []);

  const togglePlanCheck = useCallback((key, value) => {
    setData((current) => ({ ...current, planChecks: { ...(current.planChecks || {}), [key]: value } }));
  }, []);

  const toggleTask = useCallback((id) => {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? { ...task, done: !task.done, completedAt: !task.done ? stamp : null, updatedAt: stamp }
          : task,
      ),
    }));
  }, []);

  const {
    saveSale,
    saveSales,
    deleteSale,
    deleteSales,
    saveSalesGoal,
    deleteSalesGoal,
    saveBusinessUnit,
    deleteBusinessUnit,
  } = useSalesActions(data, setData, confirm);

  const {
    classifyInbox,
    archiveInbox,
    excludeInboxContact,
    restoreCommercialContact,
    restoreInbox,
    deleteInbox,
    batchClassifyInbox,
    batchArchiveInbox,
    batchExcludeInbox,
    batchDeleteInbox,
    deleteLegacyInbox,
    deleteAllLegacyInbox,
    openInboxDraft,
    openInboxContact,
    confirmInboxDraft,
  } = useInboxActions({ data, setData, confirm, session, inboxDraft, setInboxDraft, setSelectedClientId });

  const {
    deleteClient,
    mergeClient,
    undoMerge,
    markNotDuplicate,
    postponeDuplicate,
    deleteInteraction,
    deleteTask,
    updateClient,
    setClientType,
    applyClientLocations,
  } = useClientActions({ data, setData, confirm, session });
  // InteractionDetail está memoizado con memo(): estos tres handlers antes se
  // creaban inline en el JSX (nueva función en cada render de App()), lo que
  // anulaba el memo apenas se abría el modal.
  const closeInteractionDetail = useCallback(
    () => setSelectedInteractionId(null),
    [setSelectedInteractionId],
  );
  const openClientFromInteraction = useCallback(
    (clientId) => {
      setSelectedInteractionId(null);
      setSelectedClientId(clientId);
    },
    [setSelectedInteractionId, setSelectedClientId],
  );
  const deleteInteractionFromDetail = useCallback(
    async (id) => {
      if (await deleteInteraction(id)) setSelectedInteractionId(null);
    },
    [deleteInteraction, setSelectedInteractionId],
  );

  function updateTask(updatedTask) {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === updatedTask.id
          ? { ...task, ...updatedTask, updatedAt: stamp }
          : task,
      ),
    }));
  }

  function saveManualTask(event) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const client = data.clients.find((item) => item.id === taskForm.clientId);
    const task = {
      ...taskForm,
      id: crypto.randomUUID(),
      company: client?.company || taskForm.company.trim() || "Sin empresa",
      done: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }));
    setTaskForm(blankTask());
    setShowTaskForm(false);
  }

  const isFelipeTools = ownsFelipeTools(session?.user?.email, onlineConfigured);
  const seesRapyp = canSeeRapypMap(session?.user?.email, onlineConfigured);
  const shownMapTab = !seesRapyp && mapTab === "aplicadores" ? "ventas" : mapTab;
  const companyMapClients = useRapypClients({ session, seesRapyp, isFelipeTools, clients: data.clients });
  useEffect(() => {
    if (!isFelipeTools) return undefined;
    let active = true;
    import("./trello-plan.mjs").then((module) => active && setTrelloPlan(module.TRELLO_PLAN)).catch(() => {});
    return () => { active = false; };
  }, [isFelipeTools]);
  // Señal única y barata para el ícono de "Tareas": tareas vencidas
  // (mismo criterio que overdueTasks en Dashboard.jsx).
  const overdueTaskCount = data.tasks.filter(
    (task) => !task.done && task.kind !== "evento" && task.dueDate && task.dueDate < today(),
  ).length;
  // Hot leads + cotizaciones frías en el ícono de "Por revisar": reutiliza
  // `dailySignals` (ya calculado y cacheado por el cron diario, ver
  // daily-maintenance.mjs) en vez de correr findStaleHotLeads/findColdQuotes
  // acá - eso repetiría en cada render del sidebar (montado siempre) un
  // cálculo pensado para correr una vez por día. Si dailySignals no existe
  // todavía o quedó de un día anterior (nadie abrió el CRM y el cron no
  // corrió), no se muestra nada en vez de mostrar un número viejo o
  // engañoso - mismo criterio de "sin confirmar antes que inventar" que el
  // resto del sistema de señales.
  const signalsAreFreshForBadge = data.dailySignals && String(data.dailySignals.calculatedAt || "").slice(0, 10) === today();
  const inboxSignalCount = signalsAreFreshForBadge
    ? (data.dailySignals.hotLeadsCount || 0) + (data.dailySignals.coldQuotesCount || 0)
    : 0;

  // Estas 3 pantallas (login/carga/error) tienen que decidirse ACÁ, después
  // de que TODOS los hooks de arriba (useState/useCallback/useMemo/
  // useEffect) ya se llamaron sin excepción - un early return más arriba,
  // antes de definir el resto de los hooks, hace que React vea una
  // cantidad distinta de hooks entre el render "cargando" y el render
  // "listo" y crashea con "Rendered more hooks than during the previous
  // render" (pantalla en blanco en producción, sin ningún error de
  // servidor porque el crash es 100% del lado del navegador). Las reglas
  // de hooks de React exigen que se llamen siempre, en el mismo orden, sin
  // importar en qué rama de código termine el componente.
  if (!authReady) return <Splash text="Preparando acceso seguro…" />;
  if (onlineConfigured && !session) return <LoginScreen />;
  // Mientras se descarga el workspace inicial de Supabase no había ningún
  // indicio visual - se veía la app vacía (o con datos locales viejos de
  // otro dispositivo) y parecía colgada. Si falla, se ofrece reintentar en
  // vez de dejar al usuario mirando una pantalla en blanco para siempre.
  if (onlineConfigured && session && !remoteReady) {
    if (syncStatus === "Error al cargar") {
      return (
        <div className="login-shell" role="alert">
          <section className="login-card splash-card">
            <PoliplastMark />
            <h1>No se pudo cargar tu información</h1>
            <p>Revisá tu conexión e intentá de nuevo.</p>
            <button className="primary" onClick={retryLoad}>
              Reintentar
            </button>
          </section>
        </div>
      );
    }
    return <Splash text="Cargando tu información…" />;
  }

  return (
    <div className="app-shell">
      <AppSidebar
        view={view}
        onSelect={(id) => { if (id === "quoter") setQuoterClient(null); setView(id); }}
        collapsedNavGroups={collapsedNavGroups}
        setCollapsedNavGroups={setCollapsedNavGroups}
        narrowScreen={narrowScreen}
        overdueTaskCount={overdueTaskCount}
        inboxSignalCount={inboxSignalCount}
        email={session?.user?.email}
        denied={deniedModules}
      />

      <main>
        <AppTopbar
          title={NAV_ITEMS.find(([id]) => id === view)?.[1]}
          myChannels={myChannels}
          primaryChannel={data.primaryChannel}
          readiness={readiness}
          syncStatus={syncStatus}
          onRetrySave={retrySave}
          theme={theme}
          onThemeChange={setTheme}
          onOpenPalette={() => setShowPalette(true)}
          onOpenShortcuts={() => setShowShortcutsHelp(true)}
          profileLabel={data.profileName || session?.user?.email || ""}
          onLogConversation={LOG_CONVERSATION_VIEWS.includes(view) ? () => setShowForm(true) : null}
        />
        <ErrorBoundary key={view} view={view}>

        {view === "dashboard" && (
          <Dashboard
            session={session}
            metrics={metrics}
            tasks={data.tasks}
            interactions={data.interactions}
            clients={data.clients}
            sales={data.sales || EMPTY_ARRAY}
            inbox={data.inbox || EMPTY_ARRAY}
            myChannels={myChannels}
            weeklyTargets={data.weeklyTargets}
            planChecks={data.planChecks}
            showRoutine={isFelipeTools}
            showWelcome={shouldShowWelcome(data)}
            welcomeName={data.profileName}
            onDismissWelcome={dismissWelcome}
            onNewInteraction={openNewInteractionForm}
            dailySignals={data.dailySignals}
            cronStatus={cronStatus}
            whatsappHealth={whatsappHealth}
            supabase={onlineConfigured && session ? supabase : null}
            prospects={data.prospects || EMPTY_ARRAY}
            showWeekly={canSeeWeeklySummary(session?.user?.email)}
            isAdmin={isChannelAdmin(session?.user?.email)}
            onToggle={toggleTask}
            onOpenTask={setSelectedTaskId}
            onOpenInteraction={setSelectedInteractionId}
            onOpenEvent={openInboxDraft}
            onNavigate={setView}
          />
        )}
        {view === "conversations" && (
          <Suspense fallback={<Splash text="Cargando conversaciones…" />}>
            <Conversations
              items={data.interactions}
              clients={data.clients}
              onOpen={setSelectedInteractionId}
              onOpenClient={setSelectedClientId}
            />
          </Suspense>
        )}
        {view === "inbox" && (
          <Suspense fallback={<Splash text="Cargando bandeja…" />}>
            <WhatsAppInbox
              items={data.inbox}
              statusEvents={outboundStatusEvents}
              clients={data.clients}
              whatsappHealth={myChannels.includes("general") ? whatsappHealth : null}
              onNavigate={setView}
              myChannels={myChannels}
              onClassify={classifyInbox}
              onDraft={openInboxDraft}
              onOpen={openInboxContact}
              onArchive={archiveInbox}
              onRestore={restoreInbox}
              onDelete={deleteInbox}
              onDeleteLegacy={deleteLegacyInbox}
              onDeleteAllLegacy={deleteAllLegacyInbox}
              onExclude={excludeInboxContact}
              onRestoreCommercial={restoreCommercialContact}
              onBatchClassify={batchClassifyInbox}
              onBatchArchive={batchArchiveInbox}
              onBatchExclude={batchExcludeInbox}
              onBatchDelete={batchDeleteInbox}
            />
          </Suspense>
        )}
        {view === "tasks" && (
          <Tasks
            items={data.tasks}
            onToggle={toggleTask}
            onOpen={setSelectedTaskId}
            onNew={openTaskForm}
            planChecks={data.planChecks}
            onTogglePlan={togglePlanCheck}
            onNavigate={setView}
            onImportPlan={isFelipeTools ? importTrelloPlan : undefined}
            onImportTasks={importTrelloTasks}
            plan={trelloPlan}
            onPostpone={postponeTaskTo}
            personal={isFelipeTools}
            onAddEvent={addEvent}
          />
        )}
        {view === "sales" && (
          <Suspense fallback={<Splash text="Cargando ventas…" />}>
            <Sales
              items={data.sales || EMPTY_ARRAY}
              goals={data.salesGoals || EMPTY_ARRAY}
              businessUnits={data.businessUnits}
              clients={data.clients || EMPTY_ARRAY}
              onSaveGoal={saveSalesGoal}
              onDeleteGoal={deleteSalesGoal}
              onSaveBusinessUnit={saveBusinessUnit}
              onDeleteBusinessUnit={deleteBusinessUnit}
              onSave={saveSale}
              onSaveMany={saveSales}
              onDelete={deleteSale}
              onDeleteMany={deleteSales}
            />
          </Suspense>
        )}
        {view === "clients" && (
          <div className="segmented routine-tabs" role="tablist" aria-label="Empresas y contactos" style={{ marginBottom: 12, width: "fit-content" }}>
            {[["empresas", "Empresas"], ["contactos", "Personas de contacto"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={clientsTab === key} className={clientsTab === key ? "selected" : ""} onClick={() => setClientsTab(key)}>{label}</button>
            ))}
          </div>
        )}
        {view === "clients" && clientsTab === "contactos" && (
          <Suspense fallback={<Splash text="Cargando contactos…" />}>
            <Contacts
              clients={data.clients}
              query={query}
              setQuery={setQuery}
              searchInputRef={searchInputRef}
              onOpenClient={setSelectedClientId}
            />
          </Suspense>
        )}
        {view === "clients" && clientsTab === "empresas" && (
          <Suspense fallback={<Splash text="Cargando clientes…" />}>
            <Clients
              clients={filteredClients}
              query={query}
              setQuery={setQuery}
              searchInputRef={searchInputRef}
              onOpenClient={setSelectedClientId}
              onMergeClients={mergeClient}
              mergeLogs={data.mergeLogs || EMPTY_ARRAY}
              onUndoMerge={undoMerge}
              duplicateReviewDecisions={data.duplicateReviewDecisions || EMPTY_ARRAY}
              onMarkNotDuplicate={markNotDuplicate}
              onPostponeDuplicate={postponeDuplicate}
            />
          </Suspense>
        )}
        {view === "prospecting" && (
          <Suspense fallback={<Splash text="Cargando prospección…" />}>
            <Prospeccion data={data} setData={setData} userEmail={session?.user?.email} session={session} onOpenClient={setSelectedClientId} requests={prospectRequests} supabase={supabase} />
          </Suspense>
        )}
        {view === "mercadolibre" && (
          <Suspense fallback={<Splash text="Cargando Mercado Libre…" />}>
            <MercadoLibreBoard hiddenTabs={deniedModules} email={session?.user?.email} supabase={supabase} session={session} isAdmin={isChannelAdmin(session?.user?.email)} canSeeAds={isFelipeTools} ads={data.mlAds || {}} onAdsChange={(next) => setData((current) => ({ ...current, mlAds: next }))} />
          </Suspense>
        )}
        {view === "mejoras" && (
          <Suspense fallback={<Splash text="Cargando el Centro de mejoras…" />}>
            <ImprovementCenter supabase={supabase} session={session} isAdmin={isChannelAdmin(session?.user?.email)} onOpen={setView} />
          </Suspense>
        )}
        {view === "shopify" && (
          <Suspense fallback={<Splash text="Cargando Shopify…" />}>
            <ShopifyBoard hiddenTabs={deniedModules} email={session?.user?.email} supabase={supabase} session={session} isAdmin={isChannelAdmin(session?.user?.email)} />
          </Suspense>
        )}
        {view === "academy" && (
          <Suspense fallback={<Splash text="Cargando academia…" />}>
            <Academy
              myChannels={myChannels}
              interactions={data.interactions}
              data={data}
              setData={setData}
              supabase={supabase}
              userEmail={session?.user?.email}
            />
          </Suspense>
        )}
        {view === "quoter" && (
          <Suspense fallback={<Splash text="Cargando cotizador…" />}>
            <CotizadorFrame session={session} client={quoterClient} />
          </Suspense>
        )}
        {view === "map" && (
          <>
            <div className="segmented" role="tablist" aria-label="Tipo de mapa" style={{ marginBottom: 12, width: "fit-content" }}>
              {[...(seesRapyp ? [["aplicadores", "Aplicadores (RAPYP)"]] : []), ["ventas", "Ventas (sin aplicadores)"], ["prospectos", "Prospectos"]].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={shownMapTab === key} className={shownMapTab === key ? "selected" : ""} onClick={() => setMapTab(key)}>{label}</button>
              ))}
            </div>
            <Suspense fallback={<Splash text="Cargando mapa…" />}>
              {shownMapTab === "aplicadores" && <MapaCobertura key="aplicadores" clients={companyMapClients} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
              {shownMapTab === "ventas" && <MapaCobertura key="ventas" modo="ventas" clients={companyMapClients} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
              {shownMapTab === "prospectos" && <MapaCobertura key="prospectos" modo="prospectos" prospects={data.prospects || []} clients={[]} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
            </Suspense>
          </>
        )}
        {view === "techdocs" && (
          <Suspense fallback={<Splash text="Cargando base técnica…" />}>
            <TechnicalDocumentsAdmin session={session} />
          </Suspense>
        )}
        {view === "profile" && (
          <Suspense fallback={<Splash text="Cargando perfil…" />}>
            <Profile data={data} setData={setData} session={session} />
          </Suspense>
        )}
        {view === "settings" && (
          <Suspense fallback={<Splash text="Cargando datos…" />}>
            <DataSettings
              data={data}
              setData={setData}
              session={session}
              syncStatus={syncStatus}
              myChannels={myChannels}
              /* "Pruebas de desarrollo": herramienta de prueba, solo para Felipe (16/10). */
              devPanel={(!onlineConfigured || isChannelAdmin(session?.user?.email)) ? <TestCleanupPanel data={data} setData={setData} session={session} /> : null}
            />
          </Suspense>
        )}
        </ErrorBoundary>
      </main>

      <Suspense fallback={null}>
      {showForm && (
        <InteractionForm
          form={form}
          setForm={setForm}
          myChannels={myChannels}
          editing={Boolean(editingInteractionId)}
          onClose={closeInteractionForm}
          onSave={saveInteraction}
        />
      )}
      {showTaskForm && (
        <TaskForm
          form={taskForm}
          setForm={setTaskForm}
          clients={data.clients}
          onClose={() => {
            setTaskForm(blankTask());
            setShowTaskForm(false);
          }}
          onSave={saveManualTask}
        />
      )}
      {inboxDraft && (
        <InboxDraftModal
          draft={inboxDraft}
          setDraft={setInboxDraft}
          onClose={() => setInboxDraft(null)}
          onConfirm={confirmInboxDraft}
        />
      )}
      {selectedInteractionId && (
        <InteractionDetail
          interaction={data.interactions.find(
            (item) => item.id === selectedInteractionId,
          )}
          client={data.clients.find(
            (item) =>
              item.id ===
              data.interactions.find(
                (entry) => entry.id === selectedInteractionId,
              )?.clientId,
          )}
          onClose={closeInteractionDetail}
          onEdit={editInteraction}
          onOpenClient={openClientFromInteraction}
          onDelete={deleteInteractionFromDetail}
        />
      )}
      {selectedClientId && (
        <ClientDetail
          client={data.clients.find((item) => item.id === selectedClientId)}
          interactions={data.interactions.filter(
            (item) => item.clientId === selectedClientId,
          )}
          tasks={data.tasks.filter(
            (item) => item.clientId === selectedClientId,
          )}
          sales={data.sales}
          onClose={() => setSelectedClientId(null)}
          onQuote={(client) => { setQuoterClient({ company: client.company || client.legalName || "", phone: client.phone || "" }); setSelectedClientId(null); setView("quoter"); }}
          onOpenInteraction={setSelectedInteractionId}
          onNewInteraction={startClientInteraction}
          onNewTask={startClientTask}
          onOpenTask={setSelectedTaskId}
          onToggleTask={toggleTask}
          onSave={updateClient}
          onDelete={deleteClient}
          supabase={supabase}
          allClients={data.clients}
        />
      )}
      {selectedTaskId && (
        <TaskDetail
          task={data.tasks.find((item) => item.id === selectedTaskId)}
          client={data.clients.find(
            (item) =>
              item.id ===
              data.tasks.find((task) => task.id === selectedTaskId)?.clientId,
          )}
          onClose={() => setSelectedTaskId(null)}
          onToggle={(taskId) => {
            toggleTask(taskId);
            setSelectedTaskId(null);
          }}
          onSave={updateTask}
          onOpenClient={(clientId) => {
            setSelectedTaskId(null);
            setSelectedClientId(clientId);
          }}
          onDelete={async (id) => {
            if (await deleteTask(id)) setSelectedTaskId(null);
          }}
        />
      )}
      {onlineConfigured && session && <AssistantButton supabase={supabase} isAdmin={isChannelAdmin(session?.user?.email)} clients={data.clients || EMPTY_ARRAY} workspace={assistantWorkspace} onAction={assistantAction} rapypClients={seesRapyp ? companyMapClients : null} firstName={String(session.user?.user_metadata?.full_name || "").trim().split(/\s+/)[0]} />}
      {showPalette && (
        <CommandPalette
          clients={data.clients || []}
          tasks={data.tasks || []}
          prospects={data.prospects || []}
          onClose={() => setShowPalette(false)}
          onPick={(item) => {
            setShowPalette(false);
            if (item.kind === "empresa") setSelectedClientId(item.id);
            else if (item.kind === "tarea") setSelectedTaskId(item.id);
            else setView("prospecting");
          }}
        />
      )}
      {showShortcutsHelp && (
        <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}
      </Suspense>
    </div>
  );
}

