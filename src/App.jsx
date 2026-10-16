import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ReceiptText,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Inbox,
  Plus,
  Search,
  UserCheck,
  Target,
  Trash2,
  GraduationCap,
  Database,
  Users,
  LayoutGrid,
  UserCog,
  FileCheck2,
  HelpCircle,
  MapPin,
} from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { Splash, Spinner, PoliplastMark } from "./ui-primitives";
import {
  CHANNELS,
  LEGACY_STAGE_MAP,
  blankInteraction,
  blankTask,
  commercialOutcome,
  commercialStage,
  googleCalendarUrl,
  initialState,
  longToday,
  profileInitials,
  today,
} from "./app-shared";
import { Tasks, TaskList, TaskDetail, TaskForm } from "./Tasks";
const TechnicalDocumentsAdmin = lazy(() =>
  import("./TechnicalDocuments").then((m) => ({ default: m.TechnicalDocumentsAdmin }))
);
const MapaCobertura = lazy(() => import("./MapaCobertura").then((m) => ({ default: m.MapaCobertura })));
// Único de los cinco named exports de Academy.jsx que se usa acá - los
// otros (CommercialKnowledge, Coach, QuickReplies, Training) son internos,
// consumidos solo por el propio <Academy> - así que separarla en su propio
// chunk no arrastra nada que este archivo necesite.
const Academy = lazy(() => import("./Academy").then((m) => ({ default: m.Academy })));
import { LoginScreen } from "./Login";
const DataSettings = lazy(() => import("./DataSettings").then((m) => ({ default: m.DataSettings })));
import { InteractionDetail } from "./Interactions";
import { ProjectBoardGateway, Dashboard } from "./Dashboard";
import { useCronStatus } from "./hooks/useCronStatus";
import { useWhatsAppHealth } from "./hooks/useWhatsAppHealth";
import { shouldShowWelcome } from "./weekly-targets.mjs";
import { conTipoManual } from "./client-type.mjs";
import { aplicarUbicaciones } from "./client-location.mjs";
import { docDe } from "./map-clients-adapter.mjs";
import { CLASSIFICATIONS } from "./knowledge";
import {
  mergeClients,
  onlineConfigured,
  supabase,
  recordDeletions,
  recordDuplicateReviewDecision,
  undoClientMerge,
} from "./online";
import { inferIntent } from "./commercial-intelligence.mjs";
import { makeRequestsApi } from "./prospect-requests.mjs";
import { planTasks } from "./trello-plan-import.mjs";
import { makeTeamApi } from "./team-api.mjs";
import { isChannelAdmin } from "./user-channels.mjs";
import { applyTheme, nextTheme, readTheme } from "./theme.mjs";
import { LocalInfo } from "./LocalInfo.jsx";
import { ownsFelipeTools, TEAM_INBOX_ENABLED } from "./personal-tools.mjs";
import { TRELLO_PLAN } from "./trello-plan.mjs";
const Sales = lazy(() => import("./Sales"));
// Vistas y modales que no se ven al abrir la app (la entrada es Hoy/dashboard):
// cada una va a su propio chunk y se baja al entrar por primera vez. Login,
// Dashboard, Tasks e Interactions quedan estáticos porque Dashboard y
// ClientDetail los comparten (TaskList, InteractionRow).
const lazyNamed = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const Pipeline = lazyNamed(() => import("./Pipeline"), "Pipeline");
const Clients = lazyNamed(() => import("./Clients"), "Clients");
const TeamInbox = lazyNamed(() => import("./TeamInbox"), "TeamInbox");
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
import { moveCard, reorderList } from "./board-model.mjs";
import {
  isIgnoredWhatsAppContact,
  whatsappContactIdentity,
  whatsappContactKey,
} from "./whatsapp-threads.mjs";
import { addInteractionOnce } from "./conversation-history.mjs";
import {
  attachWhatsAppContact,
  classifyClientContactByWhatsApp,
  clientContacts,
  clientSearchText,
  findClientByWhatsApp,
} from "./client-contacts.mjs";
import { scoreTriage, suggestTriage } from "./commercial-triage.mjs";
import { shouldCreateFollowup } from "./followup-policy.mjs";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";
import { useSelectedRecords } from "./hooks/useSelectedRecords";
import { postponeTask } from "./day-review.mjs";
import { useNavGroups } from "./hooks/useNavGroups";
import { useSalesActions } from "./hooks/useSalesActions";

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
const NAV_GROUP_NAMES = ["Hoy", "Ventas", "Cartera", "Aprender", "Más"];

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function draftFromWhatsApp(event) {
  const text = (event.text_body || "").trim();
  const lower = text.toLowerCase();
  const familyRules = [
    ["Penosil", ["penosil", "easyspray", "espuma aerosol"]],
    ["Poliurea", ["poliurea"]],
    [
      "Poliuretano",
      [
        "poliuretano",
        "espuma rígida",
        "espuma rigida",
        "aislación",
        "aislacion",
      ],
    ],
    ["PURMAC", ["purmac", "máquina", "maquina", "repuesto"]],
    [
      "PRFV",
      ["prfv", "fibra de vidrio", "resina poliéster", "resina poliester"],
    ],
    ["Carrozados", ["carrozado", "furgón", "furgon"]],
    ["Resinplast", ["resinplast"]],
    ["Imperpur", ["imperpur", "impermeabil"]],
  ];
  const genericInfo =
    /m[aá]s informaci[oó]n|informaci[oó]n sobre esto|info sobre esto|quisiera informaci[oó]n|quiero saber m[aá]s/.test(
      lower,
    );
  const penosilOpening = event.channel === "penosil" && genericInfo;
  const family =
    familyRules.find(([, words]) =>
      words.some((word) => lower.includes(word)),
    )?.[0] || (penosilOpening ? "Penosil" : "Sin definir");
  const urgent =
    /hoy|urgente|mañana|manana|esta semana|para el viernes|cuanto antes/.test(
      lower,
    );
  const commercial =
    /precio|cotiz|comprar|necesito|kg|litros|unidades|cantidad|stock/.test(
      lower,
    ) || genericInfo;
  const intent = inferIntent(text);
  return {
    company: event.customer_name || "",
    contact: event.customer_name || "",
    family,
    intent,
    summary: text || `[${event.message_type || "mensaje sin texto"}]`,
    need: penosilOpening
      ? "Consulta inicial de Penosil; aplicación y volumen todavía sin confirmar."
      : text,
    temperature:
      urgent && commercial ? "Caliente" : commercial ? "Tibio" : "Frío",
    stage: commercial ? "Apertura" : "Diagnóstico",
    // Clasificar una conversación no implica asumir un compromiso. El usuario
    // crea seguimiento solamente cuando define una acción y una fecha reales.
    nextAction: "",
    nextDate: "",
    relationship: "A confirmar",
    representsCompany: "A confirmar",
    sellerOpinion: "",
    memoryNote: "",
    triage: suggestTriage(event),
  };
}

function whatsappThreadKey(event) {
  return whatsappContactKey(event);
}

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
  const teamApi = useMemo(() => makeTeamApi(supabase), []);
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
  const [view, setView] = useState("dashboard");
  const [mapTab, setMapTab] = useState("aplicadores");
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

  const importTrelloPlan = useCallback(() => {
    setData((current) => {
      const added = planTasks(TRELLO_PLAN, current.tasks);
      return added.length ? { ...current, tasks: [...(current.tasks || []), ...added] } : current;
    });
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

  function saveOpportunity(opportunity) {
    const stamp = new Date().toISOString();
    const client = data.clients.find(
      (item) => item.id === opportunity.clientId,
    );
    const previous = data.opportunities.find(
      (item) => item.id === opportunity.id,
    );
    const stageChanged = previous && previous.stage !== opportunity.stage;
    const stageHistory = stageChanged
      ? [
          ...(previous.stageHistory || []),
          {
            from: previous.stage,
            to: opportunity.stage,
            changedAt: stamp,
            changedBy: session?.user?.email || "",
          },
        ]
      : opportunity.stageHistory || previous?.stageHistory || [];
    const record = {
      ...opportunity,
      stageHistory,
      id: opportunity.id || crypto.randomUUID(),
      updatedAt: stamp,
      createdAt: opportunity.createdAt || stamp,
    };
    const exists = data.opportunities.some((item) => item.id === record.id);
    const linkedTask = data.tasks.find(
      (item) => !item.done && item.opportunityId === record.id,
    );
    const taskRecord =
      record.nextAction && record.nextDate
        ? {
            id: linkedTask?.id || crypto.randomUUID(),
            opportunityId: record.id,
            clientId: record.clientId,
            company: client?.company || "",
            title: record.nextAction,
            dueDate: record.nextDate,
            priority: Number(record.probability) >= 70 ? "Alta" : "Media",
            cadence: "Oportunidad",
            trigger: `${record.stage} · ${record.probability || 0}% de probabilidad`,
            done: false,
            createdAt: linkedTask?.createdAt || stamp,
            updatedAt: stamp,
          }
        : null;
    const tasks = taskRecord
      ? linkedTask
        ? data.tasks.map((item) =>
            item.id === linkedTask.id ? taskRecord : item,
          )
        : [...data.tasks, taskRecord]
      : data.tasks;
    setData({
      ...data,
      opportunities: exists
        ? data.opportunities.map((item) =>
            item.id === record.id ? record : item,
          )
        : [...data.opportunities, record],
      tasks,
    });
  }

  async function deleteOpportunity(id) {
    const opportunity = data.opportunities.find((item) => item.id === id);
    const client = data.clients.find((item) => item.id === opportunity?.clientId);
    const label = opportunity?.title || client?.company || "esta oportunidad";
    const linkedTaskCount = data.tasks.filter((item) => item.opportunityId === id).length;
    const taskWarning = linkedTaskCount
      ? ` Se eliminarán también ${linkedTaskCount} tarea${linkedTaskCount === 1 ? "" : "s"} vinculada${linkedTaskCount === 1 ? "" : "s"}.`
      : "";
    if (!(await confirm(`¿Eliminar "${label}" del CRM? Esto no se puede deshacer.${taskWarning}`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => {
      const linkedTaskIds = current.tasks.filter((item) => item.opportunityId === id).map((item) => item.id);
      return recordDeletions({
        ...current,
        opportunities: current.opportunities.filter((item) => item.id !== id),
        tasks: current.tasks.filter((item) => item.opportunityId !== id),
      }, { opportunities: [id], tasks: linkedTaskIds });
    });
  }

  function saveBoardList(list) {
    setData((current) => ({
      ...current,
      boardLists: (current.boardLists || []).some((item) => item.id === list.id)
        ? current.boardLists.map((item) => item.id === list.id ? list : item)
        : [...(current.boardLists || []), list],
    }));
  }

  function deleteBoardList(id) {
    setData((current) => {
      const cardIds = (current.boardCards || []).filter((item) => item.listId === id).map((item) => item.id);
      return recordDeletions({
        ...current,
        boardLists: (current.boardLists || []).filter((item) => item.id !== id),
        boardCards: (current.boardCards || []).filter((item) => item.listId !== id),
      }, { boardLists: [id], boardCards: cardIds });
    });
  }

  function reorderBoardList(listId, direction) {
    setData((current) => ({
      ...current,
      boardLists: reorderList(current.boardLists || [], listId, direction),
    }));
  }

  function saveBoardCard(card) {
    setData((current) => ({
      ...current,
      boardCards: (current.boardCards || []).some((item) => item.id === card.id)
        ? current.boardCards.map((item) => item.id === card.id ? card : item)
        : [...(current.boardCards || []), card],
    }));
  }

  function deleteBoardCard(id) {
    setData((current) => recordDeletions({
      ...current,
      boardCards: (current.boardCards || []).filter((item) => item.id !== id),
    }, { boardCards: [id] }));
  }

  function moveBoardCard(cardId, toListId, beforeCardId) {
    setData((current) => ({
      ...current,
      boardCards: moveCard(current.boardCards || [], cardId, toListId, beforeCardId),
    }));
  }

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

  const classifyInbox = useCallback((eventId, decision) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const stamp = new Date().toISOString();
    const status = decision === "ignore" ? "ignored" : decision;
    // "Solo contexto" y "Entrenador" solo marcan el estado del mensaje, igual
    // que la clasificación masiva (batchClassifyInbox). No deben crear una
    // entrada de Historial comercial con el texto crudo de WhatsApp: el
    // Historial se alimenta únicamente por el flujo manual "Revisar
    // conversación" (borrador con resumen escrito por la persona vendedora).
    if (decision === "ignore" || decision === "memory" || decision === "training") {
      const threadKey = whatsappThreadKey(event);
      setData({
        ...data,
        inbox: data.inbox.map((item) =>
          whatsappThreadKey(item) === threadKey
            ? { ...item, classification_status: status, classifiedAt: stamp }
            : item,
        ),
      });
      return;
    }

    const company =
      event.customer_name || event.customer_wa_id || "Contacto de WhatsApp";
    const existing = findClientByWhatsApp(data.clients, event);
    const clientId = existing?.id || crypto.randomUUID();
    const client = attachWhatsAppContact(
      existing || {
        id: clientId,
        company,
        contact: event.customer_name || "",
        whatsappId: event.customer_wa_id,
        family: "Sin definir",
        currentIntent: inferIntent(event.text_body),
        temperature: "Tibio",
        stage: decision === "followup" ? "Apertura" : "Diagnóstico",
        clientType: "Desconocido",
        industry: "Desconocida",
        fit: "A confirmar",
        urgency: "A confirmar",
        potential: "Hipótesis media",
        pipelineActive: true,
        lastContact: today(),
        updatedAt: stamp,
      },
      event,
    );
    const interaction = {
      id: crypto.randomUUID(),
      clientId,
      sourceEventId: event.event_id,
      company,
      contact: event.customer_name || "",
      channel: event.channel === "penosil" ? "penosil" : "general",
      family: "Sin definir",
      intent: inferIntent(event.text_body),
      summary: event.text_body || `[${event.message_type || "mensaje"}]`,
      need: "",
      objection: "",
      temperature: "Tibio",
      stage: client.stage,
      authorization: decision,
      trainingAllowed: decision === "training",
      createdAt: event.occurred_at || stamp,
    };
    const newTask =
      decision === "followup"
        ? {
            id: crypto.randomUUID(),
            clientId,
            company,
            title: "Revisar y responder conversación de WhatsApp",
            dueDate: today(),
            cadence: "Diaria",
            priority: "Media",
            done: false,
            createdAt: stamp,
          }
        : null;
    setData({
      ...data,
      clients: existing
        ? data.clients.map((item) =>
            item.id === clientId
              ? { ...client, lastContact: today(), updatedAt: stamp }
              : item,
          )
        : [...data.clients, client],
      interactions: addInteractionOnce(data.interactions, interaction),
      tasks: newTask ? [...data.tasks, newTask] : data.tasks,
      inbox: data.inbox.map((item) =>
        whatsappThreadKey(item) === whatsappThreadKey(event)
          ? { ...item, classification_status: status, classifiedAt: stamp }
          : item,
      ),
    });
  }, [data]);

  const archiveInbox = useCallback((eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const stamp = new Date().toISOString();
    setData({
      ...data,
      inbox: data.inbox.map((item) =>
        whatsappThreadKey(item) === whatsappThreadKey(event)
          ? { ...item, classification_status: "archived", archivedAt: stamp }
          : item,
      ),
    });
  }, [data]);

  const excludeInboxContact = useCallback((eventId, category) => {
    if (!category) return;
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const key = whatsappThreadKey(event);
    const contactIdentity = whatsappContactIdentity(event);
    const rule = {
      key,
      contactIdentity,
      channel: event.channel,
      customerWaId: event.customer_wa_id || "",
      customerName: event.customer_name || "",
      category,
      updatedAt: new Date().toISOString(),
    };
    const rules = [
      ...(data.ignoredWhatsAppContacts || []).filter(
        (item) => !isIgnoredWhatsAppContact([rule], { customer_wa_id: item.customerWaId, customer_name: item.customerName }),
      ),
      rule,
    ];
    setData({
      ...data,
      clients: data.clients.map((client) => classifyClientContactByWhatsApp(client, event, category)),
      ignoredWhatsAppContacts: rules,
      inbox: data.inbox.map((item) =>
        isIgnoredWhatsAppContact([rule], item)
          ? {
              ...item,
              classification_status: "excluded",
              excludedCategory: category,
              classifiedAt: rule.updatedAt,
            }
          : item,
      ),
      tasks: data.tasks.filter((task) => {
        const client = data.clients.find((item) => item.id === task.clientId);
        return (
          !client ||
          whatsappThreadKey({
            channel: event.channel,
            customer_wa_id: client.whatsappId,
            customer_name: client.company,
          }) !== key ||
          task.title !== "Revisar nuevo mensaje de WhatsApp"
        );
      }),
    });
  }, [data]);

  const restoreCommercialContact = useCallback((eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const key = whatsappThreadKey(event);
    const eventAsRule = { customerWaId: event.customer_wa_id, customerName: event.customer_name };
    setData({
      ...data,
      clients: data.clients.map((client) => classifyClientContactByWhatsApp(client, event, "")),
      ignoredWhatsAppContacts: (data.ignoredWhatsAppContacts || []).filter(
        (item) => !isIgnoredWhatsAppContact([eventAsRule], { customer_wa_id: item.customerWaId, customer_name: item.customerName }),
      ),
      inbox: data.inbox.map((item) =>
        isIgnoredWhatsAppContact([eventAsRule], item)
          ? {
              ...item,
              classification_status: "pending",
              excludedCategory: null,
              classifiedAt: null,
            }
          : item,
      ),
    });
  }, [data]);

  const restoreInbox = useCallback((eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    setData({
      ...data,
      inbox: data.inbox.map((item) =>
        whatsappThreadKey(item) === whatsappThreadKey(event)
          ? { ...item, classification_status: "memory", archivedAt: null }
          : item,
      ),
    });
  }, [data]);

  const deleteInbox = useCallback(async (eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const name = event.customer_name || event.customer_wa_id || "este contacto";
    if (
      !(await confirm(
        `¿Eliminar del CRM la memoria de ${name}? Esto no borra el chat original de WhatsApp.`,
        { danger: true, confirmLabel: "Eliminar" },
      ))
    )
      return;
    const deletedIds = data.inbox
      .filter((item) => whatsappThreadKey(item) === whatsappThreadKey(event))
      .map((item) => item.event_id);
    setData({
      ...data,
      inbox: data.inbox.filter((item) => !deletedIds.includes(item.event_id)),
      dismissedInboxEventIds: [
        ...new Set([...(data.dismissedInboxEventIds || []), ...deletedIds]),
      ],
    });
    if (session?.access_token)
      fetch("/api/inbox-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventIds: deletedIds }),
      }).catch(() => {});
  }, [data, confirm, session]);

  const batchClassifyInbox = useCallback((eventIds, decision) => {
    const keys = new Set(
      data.inbox
        .filter((item) => eventIds.includes(item.event_id))
        .map(whatsappThreadKey),
    );
    if (!keys.size) return;
    const status =
      { ignore: "ignored", memory: "memory", training: "training" }[decision] ||
      decision;
    const stamp = new Date().toISOString();
    setData({
      ...data,
      inbox: data.inbox.map((item) =>
        keys.has(whatsappThreadKey(item))
          ? { ...item, classification_status: status, classifiedAt: stamp }
          : item,
      ),
    });
  }, [data]);

  const batchArchiveInbox = useCallback((eventIds) => {
    const keys = new Set(
      data.inbox
        .filter((item) => eventIds.includes(item.event_id))
        .map(whatsappThreadKey),
    );
    if (!keys.size) return;
    const stamp = new Date().toISOString();
    setData({
      ...data,
      inbox: data.inbox.map((item) =>
        keys.has(whatsappThreadKey(item))
          ? { ...item, classification_status: "archived", archivedAt: stamp }
          : item,
      ),
    });
  }, [data]);

  const batchExcludeInbox = useCallback((eventIds, category) => {
    if (!category) return;
    const selected = data.inbox.filter((item) =>
      eventIds.includes(item.event_id),
    );
    const keys = new Set(selected.map(whatsappThreadKey));
    if (!keys.size) return;
    const stamp = new Date().toISOString();
    const additions = selected.map((event) => ({
      key: whatsappThreadKey(event),
      contactIdentity: whatsappContactIdentity(event),
      channel: event.channel,
      customerWaId: event.customer_wa_id || "",
      customerName: event.customer_name || "",
      category,
      updatedAt: stamp,
    }));
    setData({
      ...data,
      clients: data.clients.map((client) => {
        const matching = selected.find((event) => findClientByWhatsApp([client], event));
        return matching ? classifyClientContactByWhatsApp(client, matching, category) : client;
      }),
      ignoredWhatsAppContacts: [
        ...(data.ignoredWhatsAppContacts || []).filter(
          (item) => !isIgnoredWhatsAppContact(additions, { customer_wa_id: item.customerWaId, customer_name: item.customerName }),
        ),
        ...additions,
      ],
      inbox: data.inbox.map((item) =>
        isIgnoredWhatsAppContact(additions, item)
          ? {
              ...item,
              classification_status: "excluded",
              excludedCategory: category,
              classifiedAt: stamp,
            }
          : item,
      ),
    });
  }, [data]);

  const batchDeleteInbox = useCallback(async (eventIds) => {
    const keys = new Set(
      data.inbox
        .filter((item) => eventIds.includes(item.event_id))
        .map(whatsappThreadKey),
    );
    if (
      !keys.size ||
      !(await confirm(
        `¿Eliminar del CRM ${keys.size} ${keys.size === 1 ? "contacto seleccionado" : "contactos seleccionados"}? Los chats originales de WhatsApp no se modifican.`,
        { danger: true, confirmLabel: "Eliminar" },
      ))
    )
      return;
    const deletedIds = data.inbox
      .filter((item) => keys.has(whatsappThreadKey(item)))
      .map((item) => item.event_id);
    setData({
      ...data,
      inbox: data.inbox.filter((item) => !deletedIds.includes(item.event_id)),
      dismissedInboxEventIds: [
        ...new Set([...(data.dismissedInboxEventIds || []), ...deletedIds]),
      ],
    });
    if (session?.access_token)
      fetch("/api/inbox-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventIds: deletedIds }),
      }).catch(() => {});
  }, [data, confirm, session]);

  const deleteLegacyInbox = useCallback(async (eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    if (
      !(await confirm(
        "¿Quitar del CRM esta captura anterior? El chat original de WhatsApp no se modifica.",
        { danger: true, confirmLabel: "Quitar" },
      ))
    )
      return;
    // Las filas de "Canal por confirmar" no tienen legacyCapture (ese flag
    // es exclusivo del panel de capturas viejas); el criterio correcto para
    // borrar la fila es el hilo, no ese flag. Filtrar por legacyCapture acá
    // hacía que "Quitar captura" no borrara nada en ese panel.
    const deletedIds = data.inbox
      .filter((item) => whatsappThreadKey(item) === whatsappThreadKey(event))
      .map((item) => item.event_id);
    setData({
      ...data,
      inbox: data.inbox.filter((item) => !deletedIds.includes(item.event_id)),
      dismissedInboxEventIds: [
        ...new Set([...(data.dismissedInboxEventIds || []), ...deletedIds]),
      ],
    });
  }, [data, confirm]);

  const deleteAllLegacyInbox = useCallback(async (items) => {
    if (!items.length) return;
    if (
      !(await confirm(
        `¿Quitar del CRM las ${items.length} capturas en cuarentena? Los chats originales de WhatsApp no se modifican.`,
        { danger: true, confirmLabel: "Quitar todo" },
      ))
    )
      return;
    const keys = new Set(items.map(whatsappThreadKey));
    const deletedIds = data.inbox
      .filter((item) => keys.has(whatsappThreadKey(item)))
      .map((item) => item.event_id);
    setData({
      ...data,
      inbox: data.inbox.filter((item) => !deletedIds.includes(item.event_id)),
      dismissedInboxEventIds: [
        ...new Set([...(data.dismissedInboxEventIds || []), ...deletedIds]),
      ],
    });
  }, [data, confirm]);

  const openInboxDraft = useCallback((eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const events = data.inbox
      .filter((item) => whatsappThreadKey(item) === whatsappThreadKey(event))
      .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const transcript = events
      .slice(-20)
      .map(
        (item) =>
          `${item.direction === "outbound" ? "Equipo" : item.customer_name || "Contacto"}: ${item.text_body || `[${item.message_type || "mensaje"}]`}`,
      )
      .join("\n");
    setInboxDraft({
      event: { ...event, transcript, messageCount: events.length },
      form: { ...draftFromWhatsApp(event), summary: transcript },
    });
  }, [data]);

  const openInboxContact = useCallback((eventId) => {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const client =
      findClientByWhatsApp(data.clients, event) ||
      data.clients.find(
        (item) =>
          event.customer_name &&
          item.company?.toLowerCase() === event.customer_name.toLowerCase(),
      );
    if (client) {
      setSelectedClientId(client.id);
      return;
    }
    openInboxDraft(eventId);
  }, [data, openInboxDraft, setSelectedClientId]);

  function confirmInboxDraft(event) {
    event.preventDefault();
    if (!inboxDraft) return;
    const source = inboxDraft.event;
    const draft = inboxDraft.form;
    const stamp = new Date().toISOString();
    const existing =
      findClientByWhatsApp(data.clients, source) ||
      data.clients.find(
        (client) =>
          draft.company &&
          client.company.toLowerCase() === draft.company.trim().toLowerCase(),
      );
    const clientId = existing?.id || crypto.randomUUID();
    const company =
      draft.company.trim() ||
      source.customer_name ||
      source.customer_wa_id ||
      "Contacto de WhatsApp";
    const client = attachWhatsAppContact(
      {
        ...(existing || {}),
        id: clientId,
        company,
        contact: draft.contact.trim(),
        whatsappId: source.customer_wa_id,
        family: draft.family,
        temperature: draft.temperature,
        stage: draft.stage,
        currentIntent: draft.intent,
        clientType: existing?.clientType || "Desconocido",
        industry: existing?.industry || "Desconocida",
        fit: existing?.fit || "A confirmar",
        urgency:
          draft.nextDate === today()
            ? "Alta"
            : existing?.urgency || "A confirmar",
        potential: existing?.potential || "Hipótesis media",
        lastContact: today(),
        updatedAt: stamp,
        pipelineActive: true,
        relationship: draft.relationship,
        representsCompany: draft.representsCompany,
        sellerOpinion: draft.sellerOpinion.trim(),
        memoryNote: draft.memoryNote.trim(),
        triage: draft.triage,
        triagePriority: scoreTriage(draft.triage).priority,
        updatedBy: session?.user?.email || "",
      },
      source,
    );
    const interaction = {
      id: crypto.randomUUID(),
      clientId,
      sourceEventId: source.event_id,
      company,
      contact: draft.contact.trim(),
      channel: source.channel === "penosil" ? "penosil" : "general",
      family: draft.family,
      intent: draft.intent,
      summary: draft.summary.trim(),
      need: draft.need.trim(),
      objection: "",
      temperature: draft.temperature,
      sellerOpinion: draft.sellerOpinion.trim(),
      memoryNote: draft.memoryNote.trim(),
      stage: draft.stage,
      authorization: "confirmed-draft",
      trainingAllowed: false,
      createdAt: source.occurred_at || stamp,
      createdBy: session?.user?.email || "",
    };
    const task = shouldCreateFollowup(draft)
      ? {
          id: crypto.randomUUID(),
          clientId,
          company,
          title: draft.nextAction.trim(),
          dueDate: draft.nextDate,
          cadence: "Diaria",
          priority: draft.temperature === "Caliente" ? "Alta" : "Media",
          done: false,
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: session?.user?.email || "",
          trigger: "Borrador confirmado desde WhatsApp",
        }
      : null;
    const hasOpenFollowup = data.tasks.some(
      (item) =>
        item.clientId === clientId && !item.done && item.title === task?.title,
    );
    setData({
      ...data,
      clients: existing
        ? data.clients.map((item) => (item.id === clientId ? client : item))
        : [...data.clients, client],
      interactions: addInteractionOnce(data.interactions, interaction),
      tasks: task && !hasOpenFollowup ? [...data.tasks, task] : data.tasks,
      inbox: data.inbox.map((item) =>
        whatsappThreadKey(item) === whatsappThreadKey(source)
          ? {
              ...item,
              classification_status: "confirmed",
              classifiedAt: stamp,
              classifiedBy: session?.user?.email || "",
            }
          : item,
      ),
    });
    setInboxDraft(null);
  }

  const deleteClient = useCallback(async (id) => {
    const client = data.clients.find((item) => item.id === id);
    if (!client) return false;
    if (!(await confirm(`¿Eliminar "${client.company}" del CRM? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return false;
    setData((current) => {
      const taskIds = current.tasks.filter((task) => task.clientId === id).map((task) => task.id);
      // Las conversaciones vinculadas a este cliente también se borran - si
      // no, el nombre seguía apareciendo en Historial ("ficha pendiente de
      // revincular") aunque la ficha ya no existiera, que es justo lo que
      // pasó: Felipe borró el cliente y "Felipe" siguió en Historial.
      const interactionIds = current.interactions.filter((item) => item.clientId === id).map((item) => item.id);
      return recordDeletions({
        ...current,
        clients: current.clients.filter((item) => item.id !== id),
        tasks: current.tasks.filter((task) => task.clientId !== id),
        interactions: current.interactions.filter((item) => item.clientId !== id),
      }, { clients: [id], tasks: taskIds, interactions: interactionIds });
    });
    return true;
  }, [data, confirm]);

  const CLIENT_MERGE_FIELDS = ["company", "legalName", "cuit", "temperature", "family", "stage", "sourceType", "clientType", "industry"];

  const mergeClient = useCallback(async (survivorId, mergedId) => {
    const survivor = data.clients.find((item) => item.id === survivorId);
    const merged = data.clients.find((item) => item.id === mergedId);
    if (!survivor || !merged) return false;
    const conflictFields = CLIENT_MERGE_FIELDS.filter((field) => {
      const a = String(survivor[field] ?? "").trim();
      const b = String(merged[field] ?? "").trim();
      return a && b && a !== b;
    });
    const detail = conflictFields.length
      ? ` Quedan los datos de "${survivor.company}" en los campos donde difieren (${conflictFields.join(", ")}).`
      : "";
    if (
      !(await confirm(
        `¿Fusionar "${merged.company}" dentro de "${survivor.company}"? Se unen sus contactos, conversaciones, tareas y oportunidades en una sola ficha.${detail} Se puede deshacer desde Sistema.`,
        { confirmLabel: "Fusionar" },
      ))
    )
      return false;
    setData((current) =>
      mergeClients(current, survivorId, mergedId, {
        actor: session?.user?.email || "",
        conflictFields,
      }),
    );
    return true;
  }, [data, confirm, session]);

  const undoMerge = useCallback(async (mergeLogId) => {
    const log = (data.mergeLogs || []).find((item) => item.id === mergeLogId);
    if (!log) return false;
    const mergedName = log.snapshotAntes?.merged?.company || "la ficha fusionada";
    if (!(await confirm(`¿Deshacer esta fusión y volver a separar "${mergedName}"?`, { confirmLabel: "Deshacer" }))) return false;
    setData((current) => undoClientMerge(current, mergeLogId));
    return true;
  }, [data, confirm]);

  const markNotDuplicate = useCallback((candidate) => {
    setData((current) => recordDuplicateReviewDecision(current, candidate.id, "not_duplicate", {
      actor: session?.user?.email || "",
      signalsAtDecision: candidate.signals.map((signal) => signal.type),
    }));
  }, [session]);

  const postponeDuplicate = useCallback((candidate) => {
    setData((current) => recordDuplicateReviewDecision(current, candidate.id, "postponed", {
      actor: session?.user?.email || "",
      signalsAtDecision: candidate.signals.map((signal) => signal.type),
    }));
  }, [session]);

  const deleteInteraction = useCallback(async (id) => {
    const interaction = data.interactions.find((item) => item.id === id);
    if (!interaction) return false;
    if (!(await confirm(`¿Eliminar esta conversación de "${interaction.company}"? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return false;
    setData((current) => recordDeletions({
      ...current,
      interactions: current.interactions.filter((item) => item.id !== id),
    }, { interactions: [id] }));
    return true;
  }, [data.interactions, confirm, setData]);

  async function deleteTask(id) {
    const task = data.tasks.find((item) => item.id === id);
    if (!task) return false;
    if (!(await confirm(`¿Eliminar la tarea "${task.title}"? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return false;
    setData((current) => recordDeletions({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== id),
    }, { tasks: [id] }));
    return true;
  }

  const addPipelineClient = useCallback((company, stage) => {
    const stamp = new Date().toISOString();
    const client = {
      id: crypto.randomUUID(),
      company: company.trim(),
      family: "Sin definir",
      temperature: "Tibio",
      stage,
      pipelineActive: true,
      sourceType: "Prospecto de inteligencia comercial",
      source: "Cuentas activas",
      createdAt: stamp,
      updatedAt: stamp,
    };
    setData((current) => ({ ...current, clients: [...current.clients, client] }));
  }, [setData]);

  const updateClient = useCallback((updatedClient) => {
    const stamp = new Date().toISOString();
    setData((current) => {
      const previous = current.clients.find((client) => client.id === updatedClient.id) || {};
      const previousContacts = clientContacts(previous);
      const previousIdentities = new Set(previousContacts.map((contact) =>
        whatsappContactIdentity({ customer_wa_id: contact.whatsappId || contact.phone, customer_name: contact.name }),
      ));
      const belongsToEditedClient = (rule) => previousIdentities.has(
        rule.contactIdentity || whatsappContactIdentity({ customer_wa_id: rule.customerWaId, customer_name: rule.customerName }),
      );
      const contactRules = clientContacts(updatedClient)
        .filter((contact) => contact.commercialStatus === "non-commercial" && contact.nonCommercialCategory)
        .map((contact) => ({
          key: `contact:${whatsappContactIdentity({ customer_wa_id: contact.whatsappId || contact.phone, customer_name: contact.name })}`,
          contactIdentity: whatsappContactIdentity({ customer_wa_id: contact.whatsappId || contact.phone, customer_name: contact.name }),
          customerWaId: contact.whatsappId || contact.phone || "",
          customerName: contact.name || "",
          category: contact.nonCommercialCategory,
          updatedAt: stamp,
        }));
      return {
        ...current,
        clients: current.clients.map((client) => client.id === updatedClient.id ? { ...client, ...updatedClient, updatedAt: stamp } : client),
        tasks: current.tasks.map((task) => task.clientId === updatedClient.id ? { ...task, company: updatedClient.company || task.company, updatedAt: stamp } : task),
        ignoredWhatsAppContacts: [
          ...(current.ignoredWhatsAppContacts || []).filter((rule) => !belongsToEditedClient(rule)),
          ...contactRules,
        ],
      };
    });
  }, [setData]);
  // Mismo motivo que filteredClients: Pipeline está memoizado con memo(), así
  // que un .filter() inline en el JSX (nuevo array en cada render de App())
  // anulaba el memo por completo.
  const pipelineClients = useMemo(
    () => data.clients.filter((client) => client.pipelineActive !== false),
    [data.clients],
  );
  const changeClientStage = useCallback(
    (id, stage) => updateClient({ id, stage }),
    [updateClient],
  );
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

  // Correccion manual del tipo de cliente hecha desde el mapa (Cartera > Mapa): se guarda en
  // la ficha (tipoCliente / tipoClienteNota). Va dentro del mismo JSON del workspace, sin
  // tabla ni migracion nueva; updatedAt hace que gane en cualquier fusion con otra pestana.
  const setClientType = useCallback((doc, tipoCliente, nota) => {
    setData((current) => ({
      ...current,
      clients: (current.clients || []).map((client) => (docDe(client) === doc ? conTipoManual(client, tipoCliente, nota) : client)),
    }));
  }, []);

  // Ubicaciones cargadas en bloque desde una planilla (Cartera > Mapa > Pendientes de ubicación).
  // El plan ya viene filtrado a campos vacíos; updatedAt hace que gane en cualquier fusión.
  const applyClientLocations = useCallback((cambios) => {
    setData((current) => ({ ...current, clients: aplicarUbicaciones(current.clients || [], cambios) }));
  }, []);

  const isFelipeTools = ownsFelipeTools(session?.user?.email, onlineConfigured);
  const navGroups = [
    ["Hoy", [
      ["dashboard", "Inicio", LayoutDashboard],
      ["inbox", "Por revisar", Inbox],
      ...(TEAM_INBOX_ENABLED ? [["team", "Equipo", UserCheck]] : []),
      ["tasks", "Tareas", ClipboardList],
    ]],
    ["Ventas", [
      ["pipeline", "Cuentas activas", Target],
      ["sales", "Ventas", ReceiptText],
      ["prospecting", "Prospección", Search],
      ["conversations", "Historial", MessageCircle],
    ]],
    ["Cartera", [
      ["clients", "Empresas y contactos", Building2],
      ["map", "Mapa", MapPin],
    ]],
    ["Aprender", [
      ["academy", "Academia comercial", GraduationCap],
      ["techdocs", "Base técnica", FileCheck2],
    ]],
    ["Más", [
      ...(isFelipeTools ? [["board", "Tablero / Trello", LayoutGrid]] : []),
      ["profile", "Perfil", UserCog],
      ["settings", "Datos", Database],
    ]],
  ];
  const nav = navGroups.flatMap(([, items]) => items);
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

  function displayedChannel(key) {
    const status = readiness?.channels?.[key];
    // Un canal sin ficha (no deberia pasar: registerChannels las completa)
    // no debe tirar abajo la pantalla entera.
    if (!CHANNELS[key]) return { name: key, number: "", color: "#475569", status: "Sin configurar", statusTone: "offline" };
    if (!status) return CHANNELS[key];
    if (status.inboundEvents > 0)
      return {
        ...CHANNELS[key],
        status: `${status.source === "browser-bridge" ? "Memoria activa" : "Operativo"} · ${status.inboundEvents} mensajes reales`,
        statusTone: "online",
      };
    if (status.configured)
      return {
        ...CHANNELS[key],
        status: "Configurado · falta prueba entrante",
        statusTone: "waiting",
      };
    return {
      ...CHANNELS[key],
      status: "Conexión pendiente",
      statusTone: "offline",
    };
  }

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
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-logo"
            src="/poliplast-logo.png"
            alt="Grupo Poliplast"
          />
        </div>
        <nav>
          {navGroups.map(([group, items]) => {
            // La sección donde estás parado se ve abierta sola, sin importar
            // si la habías colapsado antes - así nunca "desaparece" de
            // adentro tuyo la pantalla en la que estás. El resto respeta lo
            // que el usuario eligió.
            const isActiveGroup = items.some(([id]) => id === view);
            // En el celular los títulos de sección no se muestran, así que nunca se colapsa.
            const collapsed = collapsedNavGroups.includes(group) && !isActiveGroup && !narrowScreen;
            return (
              <div className={`nav-group ${collapsed ? "collapsed" : ""}`} key={group}>
                <button
                  type="button"
                  className="nav-group-title"
                  onClick={() =>
                    setCollapsedNavGroups((current) =>
                      current.includes(group)
                        ? current.filter((item) => item !== group)
                        : [...current, group],
                    )
                  }
                >
                  <ChevronRight size={12} className="nav-group-caret" />
                  {group}
                  {collapsed && <span className="nav-group-count">{items.length}</span>}
                </button>
                {!collapsed &&
                  items.map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={view === id ? "active" : ""}
                      onClick={() => setView(id)}
                    >
                      <Icon size={19} /> {label}
                      {id === "tasks" && overdueTaskCount > 0 && (
                        <span className="nav-badge" aria-label={`${overdueTaskCount} tareas vencidas`}>
                          {overdueTaskCount}
                        </span>
                      )}
                      {id === "inbox" && inboxSignalCount > 0 && (
                        <span className="nav-badge" aria-label={`${inboxSignalCount} leads calientes o cotizaciones frías sin atender`}>
                          {inboxSignalCount}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">
            {onlineConfigured ? "Equipo conectado" : "MVP local"}
          </span>
          <p>
            {onlineConfigured
              ? "La cartera se comparte con los usuarios autorizados."
              : "La información permanece en este navegador durante el piloto."}
          </p>
          <div className="legal-links">
            <a href="/privacidad.html" target="_blank" rel="noreferrer">
              Privacidad
            </a>
            <a href="/terminos.html" target="_blank" rel="noreferrer">
              Términos
            </a>
            <a href="/eliminacion-datos.html" target="_blank" rel="noreferrer">
              Eliminar datos
            </a>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">{longToday()}</span>
            <LocalInfo />
            <h1>{nav.find(([id]) => id === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            {myChannels.length > 0 && (() => {
              const activeChannel = myChannels.includes(data.primaryChannel) ? data.primaryChannel : myChannels[0];
              const channelInfo = displayedChannel(activeChannel);
              return (
                <span
                  className={`channel-pill ${channelInfo.statusTone}`}
                  title={`${channelInfo.name} · ${channelInfo.number} · ${channelInfo.status}`}
                >
                  <span className="channel-dot" style={{ background: channelInfo.color }} />
                  {channelInfo.statusTone === "online" ? "Conectado" : channelInfo.statusTone === "waiting" ? "Configurado" : "No conectado"}
                </span>
              );
            })()}
            <span
              className={`sync-pill ${syncStatus === "Sincronizado" ? "ok" : ""} ${syncStatus === "Error de sincronización" ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {(syncStatus === "Guardando…" || syncStatus === "Sincronizando…" || syncStatus === "Conectando…") && (
                <Spinner size={11} />
              )}
              {syncStatus}
              {syncStatus === "Error de sincronización" && (
                <button
                  type="button"
                  className="sync-retry"
                  onClick={retrySave}
                >
                  Reintentar
                </button>
              )}
            </span>
            <button
              type="button"
              className="icon-button theme-toggle"
              aria-label={`Tema: ${theme}. Tocá para cambiar`}
              title={`Tema: ${theme} (automático, claro u oscuro)`}
              onClick={() => { const next = nextTheme(theme); applyTheme(next); setTheme(next); }}
            >
              {theme === "oscuro" ? "🌙" : theme === "claro" ? "☀️" : "🌓"}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Buscar en todo el CRM"
              title="Buscar en todo el CRM (Ctrl+K)"
              onClick={() => setShowPalette(true)}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Ver atajos de teclado"
              title="Atajos de teclado"
              onClick={() => setShowShortcutsHelp(true)}
            >
              <HelpCircle size={18} />
            </button>
            <div
              className="profile-pill"
              title={data.profileName || session?.user?.email || ""}
            >
              {profileInitials(data.profileName || session?.user?.email)}
            </div>
            {LOG_CONVERSATION_VIEWS.includes(view) && (
              <button className="primary" onClick={() => setShowForm(true)}>
                <Plus size={18} /> Registrar conversación
              </button>
            )}
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
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
            onPostpone={postponeTaskTo}
            personal={isFelipeTools}
            onAddEvent={addEvent}
          />
        )}
        {view === "pipeline" && (
          <Suspense fallback={<Splash text="Cargando pipeline…" />}>
            <Pipeline
              clients={pipelineClients}
              onOpenClient={setSelectedClientId}
              onChangeStage={changeClientStage}
              onDelete={deleteClient}
              onAdd={addPipelineClient}
            />
          </Suspense>
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
        {view === "board" && (
          <ProjectBoardGateway />
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
        {view === "team" && (
          <Suspense fallback={<Splash text="Cargando equipo…" />}>
            <TeamInbox api={teamApi} userEmail={session?.user?.email} isAdmin={isChannelAdmin(session?.user?.email)} />
          </Suspense>
        )}
        {view === "prospecting" && (
          <Suspense fallback={<Splash text="Cargando prospección…" />}>
            <Prospeccion data={data} setData={setData} userEmail={session?.user?.email} session={session} onOpenClient={setSelectedClientId} requests={prospectRequests} supabase={supabase} />
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
        {view === "map" && (
          <>
            <div className="segmented" role="tablist" aria-label="Tipo de mapa" style={{ marginBottom: 12, width: "fit-content" }}>
              {[["aplicadores", "Aplicadores (RAPYP)"], ["ventas", "Ventas (sin aplicadores)"], ["prospectos", "Prospectos"]].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={mapTab === key} className={mapTab === key ? "selected" : ""} onClick={() => setMapTab(key)}>{label}</button>
              ))}
            </div>
            <Suspense fallback={<Splash text="Cargando mapa…" />}>
              {mapTab === "aplicadores" && <MapaCobertura key="aplicadores" clients={data.clients} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
              {mapTab === "ventas" && <MapaCobertura key="ventas" modo="ventas" clients={data.clients} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
              {mapTab === "prospectos" && <MapaCobertura key="prospectos" modo="prospectos" prospects={data.prospects || []} clients={[]} onSetClientType={setClientType} onApplyLocations={applyClientLocations} userEmail={session?.user?.email} />}
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
          <Suspense fallback={<Splash text="Cargando ajustes…" />}>
            <TestCleanupPanel data={data} setData={setData} session={session} />
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
            />
          </Suspense>
        )}
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
          onOpenInteraction={setSelectedInteractionId}
          onNewInteraction={startClientInteraction}
          onNewTask={startClientTask}
          onOpenTask={setSelectedTaskId}
          onToggleTask={toggleTask}
          onSave={updateClient}
          onDelete={deleteClient}
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

