import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
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
  Target,
  Trash2,
  GraduationCap,
  Sparkles,
  Database,
  Download,
  Upload,
  Users,
  X,
  Link2,
  LayoutGrid,
  RefreshCw,
  Snowflake,
  Flame,
  ListChecks,
  UserCog,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import {
  CLASSIFICATIONS,
  QUICK_REPLIES,
  ROLE_PLAYS,
  RUBRIC,
  scoreBand,
} from "./knowledge";
import {
  completeTasksThrough,
  loadOnlineState,
  mergeWorkspaceState,
  onlineConfigured,
  recordDeletions,
  saveOnlineState,
  supabase,
  workspaceStatesEqual,
} from "./online";
import { connectWhatsApp } from "./meta-onboarding";
import { formatDate } from "./utils.mjs";
import {
  buildCommercialCohort,
  mergeCommercialCohort,
} from "./commercial-cohort";
import { inferIntent } from "./commercial-intelligence.mjs";
import { buildRepurchaseRadar } from "./repurchase-radar.mjs";
import { findColdQuotes } from "./cold-quotes.mjs";
import { findStaleHotLeads } from "./hot-leads-radar.mjs";
import Sales from "./Sales";
import PriceMemory from "./PriceMemory";
import { moveCard, reorderList } from "./board-model.mjs";
import { wasAnsweredOutside } from "./answered-outside.mjs";
import {
  fetchCommercialMaster,
  mergeCommercialMaster,
} from "./commercial-master";
import {
  groupWhatsAppThreads,
  isIgnoredWhatsAppContact,
  whatsappContactIdentity,
  whatsappContactKey,
} from "./whatsapp-threads.mjs";
import { addInteractionOnce, filterInteractionsByDate, groupConversationHistory } from "./conversation-history.mjs";
import { clientsToCsv, mergeClientsCsv } from "./client-csv.mjs";
import { readFileSmart } from "./text-decode.mjs";
import { removeExplicitTestData, testDataCandidates } from "./data-hygiene.mjs";
import {
  attachWhatsAppContact,
  classifyClientContactByWhatsApp,
  clientContacts,
  clientSearchText,
  findClientByWhatsApp,
  removeClientContact,
  setPrimaryClientContact,
  updateClientContact,
  withClientContact,
} from "./client-contacts.mjs";
import { FAMILIES } from "./families.mjs";
import { defaultBusinessUnits } from "./sales-model.mjs";
import { channelsForEmail } from "./user-channels.mjs";
import { buildSuggestion } from "./suggestion-rules.mjs";
import { prepareManualQuery } from "./ai-provider.mjs";
import { docTypeLabel } from "./technical-library.mjs";
import { isLowSignalWhatsAppEvent } from "./whatsapp-events.mjs";
import MercadoLibre from "./MercadoLibre";
import { detectDuplicateClientCandidates } from "./duplicate-candidates.mjs";
import {
  COMMERCIAL_STAGES,
  ECERA,
  KNOWLEDGE_META,
  OBJECTIONS,
  PLAYBOOKS,
  findObjections,
} from "./commercial-knowledge.mjs";
import { buildCommercialGuidance } from "./commercial-guidance.mjs";
import { TRIAGE_VARIABLES, scoreTriage, suggestTriage } from "./commercial-triage.mjs";

// El sufijo fuerza una única segunda pasada que también incluye las tareas
// antiguas sin fecha de vencimiento, usando su fecha de creación.
const TASKS_CLOSED_THROUGH = "2026-09-09.1";

const CHANNELS = {
  general: {
    name: "WhatsApp General",
    number: "+54 9 11 5262-7555",
    profile: "POLIPLAST",
    color: "#0d7764",
    status: "Meta aprobado · app conectada",
    statusTone: "online",
  },
  penosil: {
    name: "WhatsApp Penosil",
    number: "+54 9 11 7155-8957",
    profile: "FOAM",
    color: "#d9792b",
    status: "Meta aprobado · conexión pendiente",
    statusTone: "offline",
  },
  juan: {
    name: "WhatsApp Juan",
    number: "+54 9 11 2189-7610",
    profile: "GRUPO POLIPLAST",
    color: "#5a3ea6",
    status: "Meta aprobado · app conectada",
    statusTone: "online",
  },
  call: { name: "Llamada", number: "", profile: "", color: "#3b6d9b" },
  email: { name: "Email", number: "", profile: "", color: "#6b5aa6" },
};

// "Registrar conversación" solo tiene sentido donde se sigue a un cliente
// puntual, no en todos los módulos.
const LOG_CONVERSATION_VIEWS = ["conversations"];

function profileInitials(nameOrEmail = "") {
  const local = String(nameOrEmail).split("@")[0] || "";
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

const PIPELINE = [
  "Nuevo",
  "Contactado",
  "Conversación",
  "Calificado",
  "Propuesta",
  "Negociación",
  "Ganado",
  "Pausado",
  "Perdido",
];
const INTENTS = [
  "Información",
  "Precio / cotización",
  "Compra",
  "Consulta técnica",
  "Postventa",
  "Reclamo",
  "Recompra",
  "No comercial",
  "A confirmar",
];
const STORAGE_KEY = "poliplast-sales-copilot-v1";
const NAV_COLLAPSE_KEY = "poliplast-sales-copilot-nav-collapsed";
const HISTORY_RESET_VERSION = "2026-09-03T16:00:00.000Z";

const initialState = {
  clients: [],
  interactions: [],
  tasks: [],
  inbox: [],
  opportunities: [],
  sales: [],
  dismissedInboxEventIds: [],
  ignoredWhatsAppContacts: [],
  boardLists: [],
  boardCards: [],
  salesGoals: [],
  deletedRecordIds: {},
  planChecks: {},
  commercialMasterVersion: "",
  historyResetVersion: "",
};

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
    stage: commercial ? "Contactado" : "Conversación",
    nextAction: penosilOpening
      ? "Preguntar aplicación, superficie, cantidad, ubicación y para cuándo lo necesita"
      : commercial
        ? "Responder y completar diagnóstico comercial"
        : "Revisar conversación de WhatsApp",
    nextDate: urgent ? today() : addDays(commercial ? 1 : 2),
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function longToday() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function googleCalendarUrl(task) {
  const start = String(task?.dueDate || today()).replaceAll("-", "");
  const endDate = new Date(`${task?.dueDate || today()}T12:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll("-", "");
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: task?.title || "Seguimiento comercial",
    dates: `${start}/${end}`,
    details: [task?.company, task?.trigger].filter(Boolean).join(" · "),
  });
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

function useModalEscape(onClose) {
  useEffect(() => {
    const handleKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
}

function blankInteraction() {
  return {
    company: "",
    contact: "",
    channel: "general",
    family: "Sin definir",
    intent: "A confirmar",
    summary: "",
    need: "",
    objection: "",
    temperature: "Tibio",
    stage: "Conversación",
    nextAction: "",
    nextDate: today(),
    clientType: "Desconocido",
    industry: "Desconocida",
    fit: "A confirmar",
    urgency: "A confirmar",
    potential: "Hipótesis media",
    currentSupplier: "",
    decisionMaker: "",
    lossReason: "",
    repurchaseTrigger: "",
    repurchaseDate: "",
  };
}

function blankTask() {
  return {
    clientId: "",
    company: "",
    title: "",
    dueDate: today(),
    priority: "Media",
    cadence: "Seguimiento",
    trigger: "",
  };
}

export default function App() {
  const confirm = useConfirm();
  const [data, setData] = useState(loadState);
  const [session, setSession] = useState(null);
  const myChannels = channelsForEmail(session?.user?.email);
  const [authReady, setAuthReady] = useState(!onlineConfigured);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    onlineConfigured ? "Conectando…" : "Modo local",
  );
  const [readiness, setReadiness] = useState(null);
  const [view, setView] = useState("dashboard");
  const [collapsedNavGroups, setCollapsedNavGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(collapsedNavGroups));
  }, [collapsedNavGroups]);
  const [showForm, setShowForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(blankTask);
  const [editingInteractionId, setEditingInteractionId] = useState(null);
  const [form, setForm] = useState(blankInteraction);
  const [inboxDraft, setInboxDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedInteractionId, setSelectedInteractionId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [outboundStatusEvents, setOutboundStatusEvents] = useState([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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
      .then(({ state, statusEvents }) => {
        if (!active) return;
        let nextState = { ...initialState, ...state, inbox: state.inbox || [] };
        if (nextState.historyResetVersion !== HISTORY_RESET_VERSION) {
          nextState.interactions = [];
          nextState.historyResetVersion = HISTORY_RESET_VERSION;
          saveOnlineState(session.user.id, session.user.email, nextState).catch(() => {});
        }
        if ((nextState.tasksClosedThrough || "") < TASKS_CLOSED_THROUGH) {
          nextState = completeTasksThrough(nextState, TASKS_CLOSED_THROUGH);
          saveOnlineState(session.user.id, session.user.email, nextState).catch(() => {});
        }
        setData(nextState);
        setOutboundStatusEvents(statusEvents || []);
        setRemoteReady(true);
        setSyncStatus("Sincronizado");
      })
      .catch(() => active && setSyncStatus("Error de sincronización"));

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
          setData((current) => {
            if (current.inbox.some((item) => item.event_id === event.event_id))
              return current;
            const ignoredRule = isIgnoredWhatsAppContact(current.ignoredWhatsAppContacts || [], event);
            const client =
              findClientByWhatsApp(current.clients, event) ||
              current.clients.find(
                (item) =>
                  event.customer_name &&
                  item.company?.toLowerCase() ===
                    event.customer_name.toLowerCase(),
              );
            const taskTitle = "Revisar nuevo mensaje de WhatsApp";
            const hasReminder =
              client &&
              current.tasks.some(
                (item) =>
                  item.clientId === client.id &&
                  !item.done &&
                  item.title === taskTitle,
              );
            const reminder =
              !ignoredRule &&
              event.direction === "inbound" &&
              client &&
              !hasReminder
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
                  classification_status: ignoredRule
                    ? "excluded"
                    : event.classification_status || "pending",
                  excludedCategory: ignoredRule?.category,
                },
                ...current.inbox,
              ],
              tasks: reminder ? [...current.tasks, reminder] : current.tasks,
            };
          });
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
  }, [session?.user?.id]);

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
        .then(() => setSyncStatus("Sincronizado"))
        .catch(() => setSyncStatus("Error de sincronización"));
    }, 700);
    return () => clearTimeout(timer);
  }, [data, remoteReady, session?.user?.id]);

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
      overdue: data.tasks.filter((task) => !task.done && task.dueDate < now)
        .length,
      dueToday: data.tasks.filter((task) => !task.done && task.dueDate === now)
        .length,
    };
  }, [data]);

  if (!authReady) return <Splash text="Preparando acceso seguro…" />;
  if (onlineConfigured && !session) return <LoginScreen />;

  const filteredClients = data.clients.filter((client) =>
    clientSearchText(client).toLowerCase().includes(query.toLowerCase()),
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
      stage: form.stage,
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
      temperature: existing?.temperature || form.temperature || "Tibio",
      id: editingInteraction?.id || crypto.randomUUID(),
      clientId,
      createdAt: editingInteraction?.createdAt || stamp,
      updatedAt: stamp,
    };
    const tasks =
      !editingInteraction && form.nextAction.trim()
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

  function editInteraction(interaction) {
    setForm({ ...blankInteraction(), ...interaction });
    setEditingInteractionId(interaction.id);
    setSelectedInteractionId(null);
    setShowForm(true);
  }

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
      stage: client.stage || "Conversación",
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

  function toggleTask(id) {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? { ...task, done: !task.done, completedAt: !task.done ? stamp : null, updatedAt: stamp }
          : task,
      ),
    }));
  }

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
    if (!(await confirm("¿Eliminar esta oportunidad del CRM?", { danger: true, confirmLabel: "Eliminar" }))) return;
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

  function saveSale(sale) {
    const stamp = new Date().toISOString();
    const record = {
      ...sale,
      id: sale.id || crypto.randomUUID(),
      createdAt: sale.createdAt || stamp,
      updatedAt: stamp,
    };
    setData((current) => ({
      ...current,
      sales: (current.sales || []).some((item) => item.id === record.id)
        ? current.sales.map((item) => item.id === record.id ? record : item)
        : [...(current.sales || []), record],
    }));
  }

  function saveSales(rows) {
    const stamp = new Date().toISOString();
    setData((current) => {
      const sales = [...(current.sales || [])];
      for (const sale of rows) {
        const record = {
          ...sale,
          id: sale.id || crypto.randomUUID(),
          createdAt: sale.createdAt || stamp,
          updatedAt: stamp,
        };
        const index = sales.findIndex((item) => item.id === record.id);
        if (index === -1) sales.push(record);
        else sales[index] = record;
      }
      return { ...current, sales };
    });
  }

  async function deleteSale(id) {
    if (!(await confirm("¿Eliminar esta venta del registro?", { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => recordDeletions({
      ...current,
      sales: (current.sales || []).filter((item) => item.id !== id),
    }, { sales: [id] }));
  }

  async function deleteSales(ids) {
    if (!ids.length) return;
    if (!(await confirm(`¿Eliminar ${ids.length} venta${ids.length === 1 ? "" : "s"} del registro?`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => recordDeletions({
      ...current,
      sales: (current.sales || []).filter((item) => !ids.includes(item.id)),
    }, { sales: ids }));
  }

  function saveSalesGoal(goal) {
    setData((current) => {
      const existing = Array.isArray(current.salesGoals) ? current.salesGoals : [];
      const index = existing.findIndex((item) => item.id === goal.id);
      const salesGoals = index === -1 ? [...existing, goal] : existing.map((item, i) => (i === index ? goal : item));
      return { ...current, salesGoals };
    });
  }

  function deleteSalesGoal(id) {
    setData((current) => recordDeletions({
      ...current,
      salesGoals: (Array.isArray(current.salesGoals) ? current.salesGoals : []).filter((goal) => goal.id !== id),
    }, { salesGoals: [id] }));
  }

  function saveBusinessUnit(unit) {
    setData((current) => {
      const existing = Array.isArray(current.businessUnits) && current.businessUnits.length
        ? current.businessUnits
        : defaultBusinessUnits();
      const index = existing.findIndex((item) => item.id === unit.id);
      const businessUnits = index === -1
        ? [...existing, unit]
        : existing.map((item) => (item.id === unit.id ? unit : item));
      return { ...current, businessUnits };
    });
  }

  async function deleteBusinessUnit(id) {
    if (!(await confirm("¿Eliminar esta unidad de negocio? Las ventas ya cargadas con esta unidad no se modifican.", { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => {
      const existing = Array.isArray(current.businessUnits) && current.businessUnits.length
        ? current.businessUnits
        : defaultBusinessUnits();
      return recordDeletions({ ...current, businessUnits: existing.filter((item) => item.id !== id) }, { businessUnits: [id] });
    });
  }

  function classifyInbox(eventId, decision) {
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
        stage: decision === "followup" ? "Contactado" : "Conversación",
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
  }

  function archiveInbox(eventId) {
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
  }

  function excludeInboxContact(eventId, category) {
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
  }

  function restoreCommercialContact(eventId) {
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
  }

  function restoreInbox(eventId) {
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
  }

  async function deleteInbox(eventId) {
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
  }

  function batchClassifyInbox(eventIds, decision) {
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
  }

  function batchArchiveInbox(eventIds) {
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
  }

  function batchExcludeInbox(eventIds, category) {
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
  }

  async function batchDeleteInbox(eventIds) {
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
  }

  async function deleteLegacyInbox(eventId) {
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
  }

  async function deleteAllLegacyInbox(items) {
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
  }

  function openInboxDraft(eventId) {
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
  }

  function openInboxContact(eventId) {
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
  }

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
    const task = draft.nextAction.trim()
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

  async function deleteClient(id) {
    const client = data.clients.find((item) => item.id === id);
    if (!client) return;
    if (!(await confirm(`¿Eliminar "${client.company}" del CRM? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    setData((current) => {
      const taskIds = current.tasks.filter((task) => task.clientId === id).map((task) => task.id);
      return recordDeletions({
        ...current,
        clients: current.clients.filter((item) => item.id !== id),
        tasks: current.tasks.filter((task) => task.clientId !== id),
      }, { clients: [id], tasks: taskIds });
    });
  }

  function addPipelineClient(company, stage) {
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
  }

  function updateClient(updatedClient) {
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
  }

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

  const navGroups = [
    ["Ventas", [
      ["dashboard", "Inicio", LayoutDashboard],
      ["inbox", "Por revisar", Inbox],
      ["conversations", "Historial", MessageCircle],
      ["tasks", "Tareas", ClipboardList],
      ["pipeline", "Cuentas activas", Target],
      ["sales", "Ventas", ReceiptText],
    ]],
    ["Organización", [
      ["board", "Tablero / Trello", LayoutGrid],
    ]],
    ["Canales", [
      ["mercadolibre", "Mercado Libre", ShoppingBag],
    ]],
    ["Cartera", [
      ["clients", "Empresas", Building2],
      ["contacts", "Contactos", Users],
    ]],
    ["Recursos", [
      ["academy", "Academia comercial", GraduationCap],
    ]],
    ["Sistema", [
      ["profile", "Perfil", UserCog],
      ["settings", "Datos", Database],
    ]],
  ];
  const nav = navGroups.flatMap(([, items]) => items);

  function displayedChannel(key) {
    const status = readiness?.channels?.[key];
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
            const collapsed = collapsedNavGroups.includes(group);
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
                </button>
                {!collapsed &&
                  items.map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={view === id ? "active" : ""}
                      onClick={() => setView(id)}
                    >
                      <Icon size={19} /> {label}
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
            <h1>{nav.find(([id]) => id === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            {(() => {
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
              className={`sync-pill ${syncStatus === "Sincronizado" ? "ok" : ""}`}
            >
              {syncStatus}
            </span>
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
            sales={data.sales || []}
            inbox={data.inbox || []}
            myChannels={myChannels}
            onToggle={toggleTask}
            onOpenTask={setSelectedTaskId}
            onOpenInteraction={setSelectedInteractionId}
            onNavigate={setView}
          />
        )}
        {view === "conversations" && (
          <Conversations
            items={data.interactions}
            clients={data.clients}
            onOpen={setSelectedInteractionId}
            onOpenClient={setSelectedClientId}
          />
        )}
        {view === "inbox" && (
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
        )}
        {view === "tasks" && (
          <Tasks
            items={data.tasks}
            onToggle={toggleTask}
            onOpen={setSelectedTaskId}
            onNew={() => setShowTaskForm(true)}
          />
        )}
        {view === "pipeline" && (
          <Pipeline
            clients={data.clients.filter(
              (client) => client.pipelineActive !== false,
            )}
            onOpenClient={setSelectedClientId}
            onChangeStage={(id, stage) => updateClient({ id, stage })}
            onDelete={deleteClient}
            onAdd={addPipelineClient}
          />
        )}
        {view === "sales" && (
          <Sales
            items={data.sales || []}
            goals={data.salesGoals || []}
            businessUnits={data.businessUnits}
            onSaveGoal={saveSalesGoal}
            onDeleteGoal={deleteSalesGoal}
            onSaveBusinessUnit={saveBusinessUnit}
            onDeleteBusinessUnit={deleteBusinessUnit}
            onSave={saveSale}
            onSaveMany={saveSales}
            onDelete={deleteSale}
            onDeleteMany={deleteSales}
          />
        )}
        {view === "board" && (
          <ProjectBoardGateway />
        )}
        {view === "mercadolibre" && <MercadoLibre session={session} />}
        {view === "clients" && (
          <Clients
            clients={filteredClients}
            query={query}
            setQuery={setQuery}
            onOpenClient={setSelectedClientId}
          />
        )}
        {view === "contacts" && (
          <Contacts
            clients={data.clients}
            query={query}
            setQuery={setQuery}
            onOpenClient={setSelectedClientId}
          />
        )}
        {view === "academy" && (
          <Academy
            myChannels={myChannels}
            interactions={data.interactions}
            data={data}
            setData={setData}
          />
        )}
        {view === "profile" && (
          <Profile data={data} setData={setData} session={session} />
        )}
        {view === "settings" && (
          <TestCleanupPanel data={data} setData={setData} session={session} />
        )}
        {view === "settings" && (
          <DataSettings
            data={data}
            setData={setData}
            session={session}
            syncStatus={syncStatus}
          />
        )}
      </main>

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
          onClose={() => setSelectedInteractionId(null)}
          onEdit={editInteraction}
          onOpenClient={(clientId) => {
            setSelectedInteractionId(null);
            setSelectedClientId(clientId);
          }}
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
          onClose={() => setSelectedClientId(null)}
          onOpenInteraction={setSelectedInteractionId}
          onNewInteraction={startClientInteraction}
          onNewTask={startClientTask}
          onSave={updateClient}
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
        />
      )}
    </div>
  );
}

const DAY_PLAN_PREFIX = "poliplast-day-plan-";

function ProjectBoardGateway() {
  return (
    <div className="content-stack">
      <section className="panel academy-hero">
        <div>
          <span className="eyebrow">Organización del trabajo</span>
          <h2>Tablero maestro en Trello</h2>
          <p>
            Trello es la única fuente para proyectos, prioridades, responsables y fechas. El CRM conserva clientes,
            conversaciones, tareas comerciales y ventas. Así evitamos dos tableros que se contradigan.
          </p>
        </div>
        <a
          className="primary"
          href="https://trello.com/b/uSYz1qMF/ventas-grupo-poliplast"
          target="_blank"
          rel="noreferrer"
        >
          Abrir VENTAS — Grupo Poliplast <ExternalLink size={16} />
        </a>
      </section>

      <section className="panel commercial-knowledge">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Guía única</span>
            <h2>Cómo usar el tablero</h2>
          </div>
        </div>
        <div className="knowledge-grid stages">
          <article><span>1</span><h3>00 — Norte y métricas</h3><p>Entrá acá para recordar objetivos, reglas y estado general.</p></article>
          <article><span>2</span><h3>Prioridad semanal</h3><p>Solo lo verdaderamente importante durante esta semana.</p></article>
          <article><span>3</span><h3>En ejecución</h3><p>Trabajo que alguien está realizando ahora, con responsable claro.</p></article>
          <article><span>4</span><h3>Esperando / Bloqueado</h3><p>Separá lo que depende de terceros de lo que tiene un impedimento real.</p></article>
          <article><span>5</span><h3>Revisión / Terminado</h3><p>Primero se valida el resultado; después se cierra la tarjeta.</p></article>
          <article><span>6</span><h3>Backlog</h3><p>Ideas y trabajos futuros que no deben competir con la semana actual.</p></article>
        </div>
        <p className="quality-note">
          <strong>Regla:</strong> una empresa o conversación nunca se convierte en tarjeta de Trello. Se registra en
          Empresas, Por revisar, Historial o Tareas dentro del CRM.
        </p>
      </section>
    </div>
  );
}

function useDayPlan() {
  const key = DAY_PLAN_PREFIX + today();
  const [plan, setPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(plan));
    } catch {
      // localStorage puede fallar en modo privado; el plan simplemente no persiste.
    }
  }, [plan, key]);
  return [plan, setPlan];
}

// El plan de hoy no se autocompleta: a primera hora se sugieren los
// pendientes reales (tareas vencidas, cotizaciones frías, recompra, RRSS) y
// el usuario decide cuáles suma como "esto lo hago hoy", más lo que quiera
// escribir a mano. De ahí en más solo tilda lo que va resolviendo.
// Tareas fijas sugeridas cada día, distintas según el canal de la cuenta -
// lo que Felipe hace en General no es lo que hace quien opera Penosil.
const PINNED_TASKS_BY_CHANNEL = {
  general: [
    { id: "rrss", label: "Mensajes RRSS — leer y contestar todas las cuentas del grupo" },
  ],
  penosil: [
    { id: "penosil-catalogo", label: "Subir productos al catálogo" },
    { id: "penosil-whatsapp", label: "Contestar todos los WhatsApp" },
    { id: "penosil-prospectar", label: "Prospectar y buscar (público objetivo de Penosil)" },
    { id: "penosil-estado", label: "Subir estado" },
    { id: "penosil-contenido", label: "Subir contenido al canal" },
  ],
};

function DayMode({ overdueTasks, dueTodayTasks, hotLeads, coldQuotes, repurchaseRadar, myChannels, onNavigate }) {
  const [plan, setPlan] = useDayPlan();
  const [customText, setCustomText] = useState("");
  const planIds = new Set(plan.map((item) => item.id));

  function addToPlan(id, label) {
    if (planIds.has(id)) return;
    setPlan((current) => [...current, { id, label, done: false }]);
  }
  function toggleDone(id) {
    setPlan((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }
  function removeFromPlan(id) {
    setPlan((current) => current.filter((item) => item.id !== id));
  }
  function addCustom(event) {
    event.preventDefault();
    if (!customText.trim()) return;
    setPlan((current) => [...current, { id: `custom:${crypto.randomUUID()}`, label: customText.trim(), done: false }]);
    setCustomText("");
  }

  const candidates = [
    ...hotLeads.map((item) => ({ id: `hot:${item.eventId}`, label: `🔥 Responder — ${item.customer} lleva ${item.daysSince}d sin respuesta` })),
    ...dueTodayTasks.map((task) => ({
      id: `task:${task.id}`,
      label: `${task.title}${task.company ? ` — ${task.company}` : ""}`,
    })),
    ...(overdueTasks.length ? [{ id: "overdue:summary", label: `Revisar ${overdueTasks.length} seguimientos vencidos en Tareas` }] : []),
    ...coldQuotes.map((item) => ({ id: `cold:${item.eventId}`, label: `Retomar cotización fría — ${item.customer}` })),
    ...repurchaseRadar.map((item) => ({ id: `repurchase:${item.customer}-${item.product}`, label: `Ofrecer recompra — ${item.customer} (${item.product})` })),
    ...(myChannels || []).flatMap((channel) => PINNED_TASKS_BY_CHANNEL[channel] || []),
  ].filter((item) => !planIds.has(item.id)).slice(0, 10);

  const doneCount = plan.filter((item) => item.done).length;

  return (
    <section className="panel day-mode">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Primera hora</span>
          <h2>Plan de hoy</h2>
          <p>¿Qué pensás hacer hoy? Sumá lo que te sirva de lo pendiente y marcá lo que vayas resolviendo.</p>
        </div>
        <ListChecks size={22} />
      </div>
      {plan.length > 0 && (
        <div className="day-mode-list">
          {plan.map((item) => (
            <label className={`day-mode-item${item.done ? " is-done" : ""}`} key={item.id}>
              <input type="checkbox" checked={item.done} onChange={() => toggleDone(item.id)} />
              <span>{item.label}</span>
              <button type="button" className="icon-button" onClick={() => removeFromPlan(item.id)} aria-label="Quitar del plan">
                <X size={13} />
              </button>
            </label>
          ))}
          <small className="day-mode-progress">{doneCount} de {plan.length} hechas</small>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="day-mode-candidates">
          <span className="day-mode-subhead">Pendiente — ¿lo hacés hoy?</span>
          {candidates.map((item) => (
            <button type="button" className="day-mode-candidate" key={item.id} onClick={() => addToPlan(item.id, item.label)}>
              <Plus size={13} /> {item.label}
            </button>
          ))}
        </div>
      )}
      <form className="day-mode-add" onSubmit={addCustom}>
        <input
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          placeholder="¿Algo pendiente que quieras agregar?"
        />
        <button type="submit" className="secondary">
          <Plus size={15} /> Agregar
        </button>
      </form>
      {overdueTasks.length > 0 && (
        <button type="button" className="link-button day-mode-link" onClick={() => onNavigate("tasks")}>
          Ver todas las tareas vencidas en Tareas
        </button>
      )}
      {hotLeads.length > 0 && (
        <button type="button" className="link-button day-mode-link" onClick={() => onNavigate("inbox")}>
          Ver los mensajes calientes sin responder en Por revisar
        </button>
      )}
    </section>
  );
}

function Dashboard({
  metrics,
  tasks,
  interactions,
  sales,
  inbox,
  myChannels,
  onToggle,
  onOpenTask,
  onOpenInteraction,
  onNavigate,
}) {
  const repurchaseRadar = buildRepurchaseRadar(sales).slice(0, 6);
  const coldQuotes = findColdQuotes(inbox, sales).slice(0, 6);
  const hotLeads = findStaleHotLeads(inbox).slice(0, 6);
  const now = today();
  const overdueTasks = tasks.filter((task) => !task.done && task.dueDate && task.dueDate < now);
  const dueTodayTasks = tasks.filter((task) => !task.done && task.dueDate === now);
  const latestByContact = [];
  const seenContacts = new Set();
  for (const interaction of interactions) {
    const contactKey = String(
      interaction.contact ||
        interaction.clientId ||
        interaction.company ||
        interaction.id,
    )
      .trim()
      .toLocaleLowerCase("es-AR");
    if (seenContacts.has(contactKey)) continue;
    seenContacts.add(contactKey);
    latestByContact.push(interaction);
  }
  const cards = [
    ["Contactos esta semana", metrics.contacts, "Meta: 15", MessageCircle],
    ["Contactos efectivos", metrics.effective, "Meta: 8–10", CheckCircle2],
    ["Propuestas activas", metrics.proposals, "Meta: 2–3", BarChart3],
    [
      "Seguimientos vencidos",
      metrics.overdue,
      metrics.dueToday ? `${metrics.dueToday} para hoy` : "Ninguno para hoy",
      CircleAlert,
    ],
    [
      "Calientes sin responder",
      hotLeads.length,
      hotLeads.length ? "Mensajes urgentes en la bandeja" : "Ninguno por ahora",
      Flame,
    ],
  ];
  return (
    <div className="content-stack">
      <DayMode
        overdueTasks={overdueTasks}
        dueTodayTasks={dueTodayTasks}
        hotLeads={hotLeads}
        coldQuotes={coldQuotes}
        repurchaseRadar={repurchaseRadar}
        myChannels={myChannels}
        onNavigate={onNavigate}
      />
      <section className="metric-grid">
        {cards.map(([label, value, note, Icon]) => (
          <article className="metric-card" key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="two-columns">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Prioridad</span>
              <h2>Próximas acciones</h2>
            </div>
            <CalendarCheck size={22} />
          </div>
          <TaskList
            items={tasks
              .filter((task) => !task.done)
              .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
              .slice(0, 6)}
            onToggle={onToggle}
            onOpen={onOpenTask}
            emptyText="Sin tareas por ahora. Registrá una conversación para que el copiloto te ayude a definir el próximo paso."
          />
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Actividad</span>
              <h2>Últimas conversaciones</h2>
            </div>
            <MessageCircle size={22} />
          </div>
          {latestByContact.length ? (
            latestByContact
              .slice(0, 5)
              .map((item) => (
                <InteractionRow
                  item={item}
                  key={item.id}
                  onOpen={onOpenInteraction}
                />
              ))
          ) : (
            <Empty text="Todavía no hay conversaciones registradas. La primera que cargues inicia la memoria comercial." />
          )}
        </article>
      </section>
      <section className="two-columns">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Se calcula solo, sin IA</span>
              <h2>Para reponer</h2>
            </div>
            <RefreshCw size={22} />
          </div>
          {repurchaseRadar.length ? (
            repurchaseRadar.map((item) => (
              <article className="radar-row" key={`${item.customer}-${item.product}`}>
                <div>
                  <strong>{item.customer}</strong>
                  <span>{item.product}</span>
                </div>
                <div>
                  <span className="radar-badge overdue">+{item.overdueDays}d</span>
                  <small>
                    cada {item.avgIntervalDays}d, último hace {item.daysSinceLast}d
                    {item.avgQuantity ? ` · ~${item.avgQuantity} por compra` : ""}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <Empty text="Todavía no hay suficientes ventas repetidas por cliente y producto para estimar ciclos de reposición." />
          )}
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Cotizaron y no volvieron</span>
              <h2>Cotizaciones frías</h2>
            </div>
            <Snowflake size={22} />
          </div>
          {coldQuotes.length ? (
            coldQuotes.map((item) => (
              <article className="radar-row" key={item.eventId}>
                <div>
                  <strong>{item.customer}</strong>
                  <span>{item.text}</span>
                </div>
                <div>
                  <span className="radar-badge cold">{item.daysSince}d</span>
                </div>
              </article>
            ))
          ) : (
            <Empty text="No hay cotizaciones sin seguimiento por ahora." />
          )}
        </article>
      </section>
      {hotLeads.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Urgente + comercial, sin clasificar</span>
              <h2>Calientes sin responder</h2>
              <p>Mensajes en "Por revisar" que suenan urgentes (hoy, mañana, para el viernes) y comerciales (precio, cantidad, stock), pero llevan más de 2 días sin que nadie los toque.</p>
            </div>
            <Flame size={22} />
          </div>
          {hotLeads.map((item) => (
            <button
              type="button"
              className="radar-row radar-row-clickable"
              key={item.eventId}
              onClick={() => onNavigate("inbox")}
            >
              <div>
                <strong>{item.customer}</strong>
                <span>{item.text}</span>
              </div>
              <div>
                <span className="radar-badge hot">{item.daysSince}d</span>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Conversations({ items, clients, onOpen, onOpenClient }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("all");
  const [temperature, setTemperature] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const conversations = groupConversationHistory(filterInteractionsByDate(items, fromDate, toDate));
  const clientIds = new Set(clients.map((client) => client.id));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const filtered = conversations.filter((item) => {
    const matchesQuery = `${item.company || ""} ${item.contact || ""} ${item.summary || ""} ${item.need || ""} ${item.family || ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const validClientIds = (item.clientIds || [item.clientId]).filter((id) => clientIds.has(id));
    const liveFamily = validClientIds.length === 1 ? clientsById.get(validClientIds[0])?.family : null;
    const matchesFamily = family === "all" || (liveFamily || item.family) === family;
    const liveTemperature = validClientIds.length === 1
      ? clientsById.get(validClientIds[0])?.temperature
      : null;
    const matchesTemperature = temperature === "all" || (liveTemperature || item.temperature || "Tibio") === temperature;
    return matchesQuery && matchesFamily && matchesTemperature;
  });
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Una conversación por cliente</span>
          <h2>Historial comercial</h2>
          <p>
            Acá aparecen conversaciones ya registradas. La Bandeja contiene lo
            nuevo que todavía requiere revisión.
          </p>
        </div>
      </div>
      <div className="list-toolbar inbox-filters">
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente o conversación…"
          />
        </label>
        <select value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="all">Todas las familias</option>
          {FAMILIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={temperature} onChange={(event) => setTemperature(event.target.value)}>
          <option value="all">Todas las temperaturas</option>
          <option>Caliente</option>
          <option>Tibio</option>
          <option>Frío</option>
        </select>
        <label className="date-filter">Desde<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="date-filter">Hasta<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      {filtered.length ? (
        <div className="conversation-list">
          {filtered.map((item) => {
            const validClientIds = (item.clientIds || [item.clientId]).filter((id) => clientIds.has(id));
            const hasClient = validClientIds.length === 1;
            // La temperatura mostrada acá es la actual de la ficha del
            // cliente, no la que se guardó al registrar la conversación —
            // si el cliente se recalifica, el historial tiene que reflejarlo,
            // no quedar con una foto vieja.
            const liveTemperature = hasClient
              ? clientsById.get(validClientIds[0])?.temperature
              : null;
            return (
              <button
                className="conversation-thread"
                key={item.conversationKey}
                onClick={() =>
                  hasClient ? onOpenClient(validClientIds[0]) : onOpen(item.id)
                }
              >
                <span
                  className="channel-dot"
                  style={{
                    background: CHANNELS[item.channel]?.color || "#7d8790",
                  }}
                />
                <div>
                  <strong>
                    {item.company || item.contact || "Contacto sin identificar"}
                  </strong>
                  <span>
                    {item.contact ||
                      CHANNELS[item.channel]?.name ||
                      "Sin contacto identificado"}{" "}
                    · {item.messageCount}{" "}
                    {item.messageCount === 1 ? "registro" : "registros"}
                    {item.clientId && !hasClient
                      ? " · ficha pendiente de revincular"
                      : ""}
                  </span>
                  <p>{item.summary || item.need || "Sin resumen registrado"}</p>
                </div>
                <div className="conversation-tail">
                  <time>
                    {new Date(item.latestContactAt).toLocaleDateString("es-AR")} · {new Date(item.latestContactAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} hs
                  </time>
                  <span
                    className={`temp ${(liveTemperature || item.temperature || "Tibio").toLowerCase()}`}
                  >
                    {liveTemperature || item.temperature || "Tibio"}
                  </span>
                  <ChevronRight size={17} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          text={
            items.length
              ? "No hay clientes que coincidan con la búsqueda."
              : "Registrá la primera conversación para comenzar la memoria comercial."
          }
        />
      )}
    </section>
  );
}

function WhatsAppInbox({
  items,
  statusEvents,
  clients,
  onClassify,
  onDraft,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onDeleteLegacy,
  onDeleteAllLegacy,
  onExclude,
  onRestoreCommercial,
  onBatchClassify,
  onBatchArchive,
  onBatchExclude,
  onBatchDelete,
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [family, setFamily] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selected, setSelected] = useState([]);
  const threads = groupWhatsAppThreads(
    items.filter((item) => !item.legacyCapture && !isLowSignalWhatsAppEvent(item)),
  ).map((item) => {
    const client =
      clients.find(
        (entry) => entry.whatsappId && entry.whatsappId === item.customer_wa_id,
      ) ||
      clients.find(
        (entry) =>
          item.customer_name &&
          entry.company?.toLowerCase() === item.customer_name.toLowerCase(),
      );
    return {
      ...item,
      commercialFamily: client?.family || "Sin definir",
      commercialPriority: client?.temperature || "A confirmar",
    };
  });
  const legacyThreads = groupWhatsAppThreads(
    items.filter((item) => item.legacyCapture),
  );
  const visible = threads.filter((item) => {
    const matchesChannel =
      channel === "all" || (item.channels || [item.channel]).includes(channel);
    const matchesFamily = family === "all" || item.commercialFamily === family;
    const matchesPriority =
      priority === "all" || item.commercialPriority === priority;
    const haystack =
      `${item.customer_name || ""} ${item.customer_wa_id || ""} ${item.text_body || ""}`.toLowerCase();
    return (
      matchesChannel &&
      matchesFamily &&
      matchesPriority &&
      haystack.includes(query.trim().toLowerCase())
    );
  });
  // Si una captura histórica aparece en ambos canales, no adivinamos cuál es
  // el correcto ni la mezclamos con la operación diaria. Queda aislada para
  // revisión sin alterar los mensajes nuevos cuyo canal sí está probado.
  const channelConflicts = visible.filter((item) => item.channelConflict);
  const operationalVisible = visible.filter((item) => !item.channelConflict);
  const archived = operationalVisible.filter(
    (item) => item.classification_status === "archived",
  );
  const excluded = operationalVisible.filter(
    (item) => item.classification_status === "excluded",
  );
  const active = operationalVisible.filter(
    (item) => !["archived", "excluded"].includes(item.classification_status),
  );
  const allPending = active.filter(
    (item) => item.classification_status === "pending",
  );
  // Los mensajes de más de 7 días sin clasificar no cuentan como pendientes
  // del día a día: se guardan aparte para que "Por revisar" arranque
  // limpio con lo reciente. Nada se borra ni se pierde.
  const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pending = allPending.filter(
    (item) => new Date(item.occurred_at || 0).getTime() >= staleCutoff,
  );
  const stalePending = allPending.filter(
    (item) => new Date(item.occurred_at || 0).getTime() < staleCutoff,
  );
  // Si Felipe ya le contestó al cliente desde el teléfono (no desde el CRM),
  // Meta manda igual una confirmación de status para ese contacto después
  // del mensaje entrante. Esa es la única señal disponible de "ya atendido"
  // sin inventar nada ni tocar la configuración de WhatsApp.
  const answeredOutside = pending.filter((item) =>
    wasAnsweredOutside(item.occurred_at, item.customer_wa_id, statusEvents || []),
  );
  const reallyPending = pending.filter(
    (item) => !answeredOutside.includes(item),
  );
  const selectable = [
    ...reallyPending,
    ...(showAnswered ? answeredOutside : []),
    ...(showStale ? stalePending : []),
    ...(showExcluded ? excluded : []),
    ...(showArchived ? archived : []),
  ];
  const visibleKeys = selectable.map((item) => item.threadKey);
  const selectedVisible = selected.filter((key) => visibleKeys.includes(key));
  const selectedIds = selectable
    .filter((item) => selectedVisible.includes(item.threadKey))
    .map((item) => item.event_id);
  const toggleSelected = (key) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  const selectAllVisible = () =>
    setSelected((current) =>
      visibleKeys.length && visibleKeys.every((key) => current.includes(key))
        ? current.filter((key) => !visibleKeys.includes(key))
        : [...new Set([...current, ...visibleKeys])],
    );
  const finishBatch = (action) => {
    action();
    setSelected([]);
  };
  const rowProps = {
    onClassify,
    onDraft,
    onOpen,
    onArchive,
    onRestore,
    onDelete,
    onExclude,
    onRestoreCommercial,
  };
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Solo entradas nuevas</span>
            <h2>Por revisar</h2>
            <p>
              Cuando decidís qué hacer, desaparece de acá y queda guardada donde
              corresponde.
            </p>
          </div>
          <span className="inbox-count">{reallyPending.length}</span>
        </div>
        <div className="list-toolbar inbox-filters">
          <label className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar contacto o mensaje…"
            />
          </label>
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value)}
          >
            <option value="all">Todas las familias</option>
            {FAMILIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="all">Todas las prioridades</option>
            <option>Caliente</option>
            <option>Tibio</option>
            <option>Frío</option>
            <option>A confirmar</option>
          </select>
        </div>
        <div className="batch-toolbar">
          <label>
            <input
              type="checkbox"
              checked={
                visibleKeys.length > 0 &&
                visibleKeys.every((key) => selected.includes(key))
              }
              onChange={selectAllVisible}
            />{" "}
            Seleccionar visibles
          </label>
          <span>
            {selectedVisible.length
              ? `${selectedVisible.length} seleccionados`
              : "Selección masiva por contacto"}
          </span>
          {selectedVisible.length > 0 && (
            <div className="batch-actions">
              <button
                onClick={() =>
                  finishBatch(() => onBatchClassify(selectedIds, "ignore"))
                }
              >
                No requiere acción
              </button>
              <button
                onClick={() =>
                  finishBatch(() => onBatchClassify(selectedIds, "memory"))
                }
              >
                Solo contexto
              </button>
              <select
                defaultValue=""
                onChange={(event) => {
                  const category = event.target.value;
                  if (category)
                    finishBatch(() => onBatchExclude(selectedIds, category));
                  event.target.value = "";
                }}
              >
                <option value="">Clasificar como…</option>
                <option value="Equipo interno">Equipo interno</option>
                <option value="Familiar / personal">Familiar / personal</option>
                <option value="Proveedor / colaborador">
                  Proveedor / colaborador
                </option>
                <option value="Otro no comercial">Otro no comercial</option>
              </select>
              <button
                onClick={() => finishBatch(() => onBatchArchive(selectedIds))}
              >
                Archivar
              </button>
              <button
                className="danger-link"
                onClick={() => finishBatch(() => onBatchDelete(selectedIds))}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
        {reallyPending.length ? (
          reallyPending.map((item) => (
            <InboxRow
              item={item}
              {...rowProps}
              selected={selected.includes(item.threadKey)}
              onToggleSelected={toggleSelected}
              key={item.threadKey}
            />
          ))
        ) : (
          <Empty text="No hay conversaciones esperando clasificación con este filtro." />
        )}
      </section>
      {answeredOutside.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Detectado por WhatsApp</span>
              <h2>Ya respondiste</h2>
              <p>
                Le mandaste algo a este contacto desde el teléfono después de
                su último mensaje. Si te equivocaste, podés reabrirlo desde
                acá igual que los demás.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowAnswered(!showAnswered)}
            >
              {showAnswered ? "Ocultar" : `Mostrar (${answeredOutside.length})`}
            </button>
          </div>
          {showAnswered &&
            answeredOutside.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {stalePending.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Más de 7 días sin clasificar</span>
              <h2>Antiguos</h2>
              <p>
                No cuentan como pendientes del día a día. Podés revisarlos y
                clasificarlos igual que los recientes.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowStale(!showStale)}
            >
              {showStale ? "Ocultar" : `Mostrar (${stalePending.length})`}
            </button>
          </div>
          {showStale &&
            stalePending.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {channelConflicts.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Fuera de la bandeja operativa</span>
              <h2>Canal por confirmar</h2>
              <p>
                Son capturas anteriores que aparecieron en General y Penosil.
                No cuentan como pendientes hasta que se confirme su origen.
              </p>
            </div>
            <span className="inbox-count warning">{channelConflicts.length}</span>
          </div>
          <button
            className="danger-link"
            onClick={() => onDeleteAllLegacy(channelConflicts)}
          >
            Limpiar todo ({channelConflicts.length})
          </button>
          {channelConflicts.map((item) => (
            <LegacyInboxRow
              item={item}
              onDelete={onDeleteLegacy}
              key={`conflict-${item.threadKey}`}
            />
          ))}
        </section>
      )}
      {excluded.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Ocultos de la operación diaria</span>
              <h2>Contactos no comerciales</h2>
              <p>
                Sus mensajes futuros se guardan fuera de la bandeja. Podés
                recuperarlos si cambian de rol o fueron clasificados por error.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowExcluded(!showExcluded)}
            >
              {showExcluded ? "Ocultar" : `Mostrar (${excluded.length})`}
            </button>
          </div>
          {showExcluded &&
            excluded.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {legacyThreads.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Visible pero aislado</span>
              <h2>Capturas anteriores para revisar</h2>
              <p>
                Pueden contener nombre de grupo o remitente mezclado. No
                alimentan clientes ni oportunidades.
              </p>
            </div>
            <span className="inbox-count warning">{legacyThreads.length}</span>
          </div>
          <button
            className="danger-link"
            onClick={() => onDeleteAllLegacy(legacyThreads)}
          >
            Limpiar todo ({legacyThreads.length})
          </button>
          {legacyThreads.map((item) => (
            <LegacyInboxRow
              item={item}
              onDelete={onDeleteLegacy}
              key={item.threadKey}
            />
          ))}
        </section>
      )}
      {archived.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Fuera de la vista diaria</span>
              <h2>Conversaciones archivadas</h2>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Ocultar" : `Mostrar (${archived.length})`}
            </button>
          </div>
          {showArchived &&
            archived.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
    </div>
  );
}

function LegacyInboxRow({ item, onDelete }) {
  const name =
    item.customer_name || item.customer_wa_id || "Origen sin identificar";
  return (
    <article className={`legacy-inbox-row channel-${item.channel}`}>
      <span
        className="channel-dot"
        style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
      />
      <div>
        <strong>{name}</strong>
        <span>
          {CHANNELS[item.channel]?.name || "WhatsApp"} · captura anterior ·{" "}
          {item.messageCount || 1} mensajes
        </span>
        <p>{item.text_body || "[sin texto]"}</p>
      </div>
      <button className="danger-link" onClick={() => onDelete(item.event_id)}>
        Quitar captura
      </button>
    </article>
  );
}

function InboxRow({
  item,
  onClassify,
  onDraft,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onExclude,
  onRestoreCommercial,
  selected,
  onToggleSelected,
}) {
  const [showActions, setShowActions] = useState(false);
  const pending = item.classification_status === "pending";
  const archived = item.classification_status === "archived";
  const labels = {
    ignored: "No requiere acción",
    memory: "Contexto guardado",
    followup: "Tarea creada",
    training: "Enviado al entrenador",
    confirmed: "Borrador confirmado",
    archived: "Archivada",
    excluded: `No comercial${item.excludedCategory ? ` · ${item.excludedCategory}` : ""}`,
  };
  const name =
    item.customer_name || item.customer_wa_id || "Contacto sin identificar";
  const intent = inferIntent(item.text_body);
  const channelNames = (item.channels || [item.channel])
    .map((key) => CHANNELS[key]?.name || "WhatsApp")
    .join(" + ");
  const occurred = new Date(item.occurred_at);
  const dateTime = `${occurred.toLocaleDateString("es-AR")} · ${occurred.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} hs`;
  const excludeSelect = (
    <select
      className="contact-exclusion"
      defaultValue=""
      aria-label={`Marcar ${name} como contacto no comercial`}
      onChange={(event) => {
        onExclude?.(item.event_id, event.target.value);
        event.target.value = "";
      }}
    >
      <option value="">No es cliente…</option>
      <option value="Equipo interno">Equipo interno</option>
      <option value="Familiar / personal">Familiar / personal</option>
      <option value="Proveedor / colaborador">Proveedor / colaborador</option>
      <option value="Otro no comercial">Otro no comercial</option>
    </select>
  );
  return (
    <article
      className={`inbox-row ${selected ? "batch-selected" : ""} ${showActions ? "actions-open" : ""}`}
    >
      <label className="inbox-select" aria-label={`Seleccionar ${name}`}>
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={() => onToggleSelected?.(item.threadKey)}
        />
      </label>
      <button
        type="button"
        className="inbox-message inbox-open"
        aria-label={`Abrir ficha de ${name}`}
        onClick={() => onOpen?.(item.event_id)}
      >
        <span
          className="channel-dot"
          style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
        />
        <div>
          <div className="inbox-name">
            <strong>{name}</strong>
            <span
              className={`intent-tag intent-${intent.toLowerCase().replaceAll(/[^a-záéíóúñ]+/g, "-")}`}
            >
              {intent}
            </span>
            {item.channelConflict && (
              <span className="channel-warning">Canal duplicado corregido</span>
            )}
          </div>
          <span>
            {channelNames} · {dateTime} · {item.messageCount || 1}{" "}
            {(item.messageCount || 1) === 1 ? "mensaje" : "mensajes"}
          </span>
          <p>
            {item.text_body || `[${item.message_type || "mensaje sin texto"}]`}
          </p>
        </div>
        <ChevronRight size={18} />
      </button>
      <button
        type="button"
        className="row-actions-toggle"
        onClick={() => setShowActions((value) => !value)}
      >
        {showActions ? "Cerrar" : "Acciones"}
      </button>
      {pending ? (
        <div className="decision-buttons">
          <button
            onClick={() => onDraft(item.event_id)}
            className="recommended"
          >
            Revisar conversación
          </button>
          <button onClick={() => onClassify(item.event_id, "ignore")}>
            No requiere acción
          </button>
          <button onClick={() => onClassify(item.event_id, "memory")}>
            Solo contexto
          </button>
          <button onClick={() => onClassify(item.event_id, "training")}>
            Entrenador
          </button>
          {excludeSelect}
          <button onClick={() => onArchive(item.event_id)}>Archivar</button>
          <button
            className="danger-link"
            onClick={() => onDelete(item.event_id)}
          >
            Eliminar del CRM
          </button>
        </div>
      ) : (
        <div className="processed-actions">
          <span className={`decision-tag ${item.classification_status}`}>
            {labels[item.classification_status] || item.classification_status}
          </span>
          {item.classification_status === "excluded" ? (
            <button onClick={() => onRestoreCommercial?.(item.event_id)}>
              Corregir: es cliente
            </button>
          ) : (
            excludeSelect
          )}
          {archived ? (
            <button onClick={() => onRestore(item.event_id)}>Restaurar</button>
          ) : (
            <button onClick={() => onArchive(item.event_id)}>Archivar</button>
          )}
          <button
            className="danger-link"
            onClick={() => onDelete(item.event_id)}
          >
            Eliminar del CRM
          </button>
        </div>
      )}
    </article>
  );
}

function CopilotSuggestionPanel({ event }) {
  const [copied, setCopied] = useState(false);
  const suggestion = useMemo(() => buildSuggestion(event), [event]);
  async function copyForAI() {
    const text = prepareManualQuery({
      family: suggestion.family,
      intent: suggestion.intent,
      temperature: suggestion.temperature,
      missingQuestions: suggestion.missingQuestions,
      recommendedDocs: suggestion.recommendedDocs,
      customerMessage: event.text_body || "",
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="copilot-suggestion">
      <div className="copilot-suggestion-head">
        <strong>Sugerencia del copiloto</strong>
        <span className="copilot-suggestion-note">
          Reglas determinísticas, sin IA todavía. No inventa rendimiento,
          compatibilidad, precio ni stock.
        </span>
      </div>
      <p>
        Familia detectada: <b>{suggestion.family}</b> · Intención:{" "}
        <b>{suggestion.intent}</b> · Temperatura: <b>{suggestion.temperature}</b>
      </p>
      {suggestion.isClosingMessage ? (
        <p className="copilot-suggestion-pending">
          Parece un cierre o agradecimiento de una conversación anterior — revisá
          el historial antes de responder, no hace falta pedirle datos de nuevo.
        </p>
      ) : (
        <>
          {suggestion.missingQuestions.length > 0 && (
            <div>
              <span className="copilot-suggestion-label">Preguntas que faltan confirmar</span>
              <ul>
                {suggestion.missingQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
          {suggestion.recommendedDocs.length > 0 && (
            <div>
              <span className="copilot-suggestion-label">Fichas técnicas a consultar (sin validar todavía)</span>
              <ul>
                {suggestion.recommendedDocs.map((doc) => (
                  <li key={doc.id}>
                    {doc.product} — {docTypeLabel(doc.docType)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="copilot-suggestion-pending">
            Rendimiento, compatibilidad, aplicación, dosificación, seguridad,
            precio y stock: pendiente de verificar contra ficha validada.
          </p>
        </>
      )}
      <button type="button" className="secondary" onClick={copyForAI}>
        {copied ? "Copiado" : "Preparar consulta para IA"}
      </button>
    </div>
  );
}

function InboxDraftModal({ draft, setDraft, onClose, onConfirm }) {
  useModalEscape(onClose);
  const update = (name, value) =>
    setDraft({ ...draft, form: { ...draft.form, [name]: value } });
  const form = draft.form;
  const triageResult = scoreTriage(form.triage);
  const updateTriage = (name, value) =>
    update("triage", { ...form.triage, [name]: value === "" ? null : Number(value) });
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onConfirm}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Copiloto · vos aportás el criterio</span>
            <h2>¿Quién es y qué hacemos con esta conversación?</h2>
            <p>
              Confirmá lo que el mensaje no puede decirnos. El CRM nunca
              responde al contacto.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar borrador"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="source-message">
          <strong>Conversación detectada</strong>
          <p>
            {draft.event.text_body ||
              `[${draft.event.message_type || "mensaje sin texto"}]`}
          </p>
        </div>
        <CopilotSuggestionPanel event={draft.event} />
        <div className="form-grid">
          <label>
            ¿Qué relación tiene?
            <select
              value={form.relationship}
              onChange={(event) => update("relationship", event.target.value)}
            >
              <option>A confirmar</option>
              <option>Cliente actual</option>
              <option>Prospecto</option>
              <option>Proveedor</option>
              <option>Socio / aliado</option>
              <option>Contacto personal</option>
              <option>No comercial</option>
            </select>
          </label>
          <label>
            ¿Representa una empresa?
            <select
              value={form.representsCompany}
              onChange={(event) =>
                update("representsCompany", event.target.value)
              }
            >
              <option>A confirmar</option>
              <option>Sí</option>
              <option>No</option>
            </select>
          </label>
          <label>
            Empresa / referencia
            <input
              required
              value={form.company}
              onChange={(event) => update("company", event.target.value)}
              placeholder="Nombre o referencia"
            />
          </label>
          <label>
            Persona / contacto
            <input
              value={form.contact}
              onChange={(event) => update("contact", event.target.value)}
            />
          </label>
          <label>
            Intención
            <select
              value={form.intent}
              onChange={(event) => update("intent", event.target.value)}
            >
              {INTENTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Familia
            <select
              value={form.family}
              onChange={(event) => update("family", event.target.value)}
            >
              {FAMILIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="span-2">
            ¿Qué pensás de este contacto?
            <textarea
              value={form.sellerOpinion}
              onChange={(event) => update("sellerOpinion", event.target.value)}
              placeholder="Ej. serio, pregunta mucho pero decide; conoce el producto; necesita seguimiento cercano"
            />
          </label>
          <label className="span-2">
            ¿Qué querés que recuerde para la próxima vez?
            <textarea
              value={form.memoryNote}
              onChange={(event) => update("memoryNote", event.target.value)}
              placeholder="Preferencias, promesas, contexto humano o comercial"
            />
          </label>
          <label>
            Temperatura
            <select
              value={form.temperature}
              onChange={(event) => update("temperature", event.target.value)}
            >
              <option>Frío</option>
              <option>Tibio</option>
              <option>Caliente</option>
            </select>
          </label>
          <label>
            Etapa
            <select
              value={form.stage}
              onChange={(event) => update("stage", event.target.value)}
            >
              {PIPELINE.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <fieldset className="triage-fieldset span-2">
            <legend>Triage comercial · una sola vez por empresa</legend>
            <div className="triage-summary">
              <strong>{triageResult.score}/12 · {triageResult.complete ? `Prioridad ${triageResult.priority}` : `${triageResult.known}/6 confirmadas`}</strong>
              <span>Los campos sin evidencia quedan sin confirmar; el CRM no completa supuestos.</span>
            </div>
            <div className="triage-grid">
              {TRIAGE_VARIABLES.map((variable) => (
                <label key={variable.id} title={variable.question}>
                  {variable.label}
                  <select value={form.triage?.[variable.id] ?? ""} onChange={(event) => updateTriage(variable.id, event.target.value)}>
                    <option value="">Sin confirmar</option>
                    {variable.options.map((option, index) => <option key={option} value={index}>{index} · {option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Fecha próxima
            <input
              type="date"
              value={form.nextDate}
              onChange={(event) => update("nextDate", event.target.value)}
            />
          </label>
          <label className="span-2">
            Resumen sugerido
            <textarea
              value={form.summary}
              onChange={(event) => update("summary", event.target.value)}
            />
          </label>
          <label className="span-2">
            Necesidad detectada
            <textarea
              value={form.need}
              onChange={(event) => update("need", event.target.value)}
            />
          </label>
          <label className="span-2">
            Próxima acción
            <input
              value={form.nextAction}
              onChange={(event) => update("nextAction", event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Ahora no
          </button>
          <button className="primary" type="submit">
            Guardar memoria y seguimiento
          </button>
        </div>
      </form>
    </div>
  );
}

function InteractionRow({ item, expanded = false, onOpen, liveTemperature }) {
  // liveTemperature (la temperatura actual de la ficha del cliente, si se
  // conoce en este contexto) pisa la que se guardó al registrar la
  // conversación — el historial no debería quedar con una foto vieja.
  const temperature = liveTemperature || item.temperature || "Tibio";
  const content = (
    <>
      <span
        className="channel-dot"
        style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
      />
      <div>
        <strong>{item.company}</strong>
        <span>
          {item.contact ||
            CHANNELS[item.channel]?.name ||
            "Contacto sin identificar"}{" "}
          · {new Date(item.createdAt).toLocaleString("es-AR")}
        </span>
        {expanded && <p>{item.summary || item.need || "Sin resumen"}</p>}
      </div>
      <div className="row-tail">
        <span className={`temp ${temperature.toLowerCase()}`}>
          {temperature}
        </span>
        <ChevronRight size={17} />
      </div>
    </>
  );
  return onOpen ? (
    <button
      className={`interaction-row ${expanded ? "expanded" : ""}`}
      onClick={() => onOpen(item.id)}
    >
      {content}
    </button>
  ) : (
    <div className={`interaction-row ${expanded ? "expanded" : ""}`}>
      {content}
    </div>
  );
}

function InteractionDetail({
  interaction,
  client,
  onClose,
  onEdit,
  onOpenClient,
}) {
  useModalEscape(onClose);
  if (!interaction) return null;
  return (
    <div className="modal-backdrop">
      <section className="modal interaction-detail">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Conversación registrada</span>
            <h2>{interaction.company}</h2>
            <p>
              {interaction.contact || "Contacto sin identificar"} ·{" "}
              {formatDate(interaction.createdAt)}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar conversación"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="conversation-detail-grid">
          <Fact label="Canal" value={CHANNELS[interaction.channel]?.name} />
          <Fact label="Familia" value={interaction.family} />
          <Fact label="Temperatura" value={client?.temperature || interaction.temperature} />
          <Fact label="Etapa" value={interaction.stage} />
        </div>
        <div className="detail-block">
          <span>Qué hablaron</span>
          <p>{interaction.summary || "Sin resumen registrado."}</p>
        </div>
        <div className="detail-block">
          <span>Necesidad detectada</span>
          <p>{interaction.need || "Necesidad pendiente de confirmar."}</p>
        </div>
        <div className="detail-block">
          <span>Próxima acción</span>
          <p>
            {interaction.nextAction || "Sin próxima acción definida."}
            {interaction.nextDate
              ? ` · ${formatDate(interaction.nextDate)}`
              : ""}
          </p>
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => onEdit(interaction)}
          >
            Editar
          </button>
          {client && (
            <button
              className="primary"
              type="button"
              onClick={() => onOpenClient(client.id)}
            >
              Ver ficha del cliente
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Tasks({ items, onToggle, onOpen, onNew }) {
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const ordered = [...items].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.dueDate || "").localeCompare(b.dueDate || ""),
  );
  const filtered = ordered.filter(
    (task) =>
      (filter === "all" || (filter === "pending" ? !task.done : task.done)) &&
      `${task.title || ""} ${task.company || ""} ${task.trigger || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Agenda única</span>
          <h2>Tareas comerciales</h2>
        </div>
        <button className="primary" type="button" onClick={onNew}>
          <Plus size={17} /> Nueva tarea
        </button>
      </div>
      <div className="list-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tarea…"
          />
        </label>
        <div className="segmented">
          <button
            className={filter === "pending" ? "selected" : ""}
            onClick={() => setFilter("pending")}
          >
            Pendientes
          </button>
          <button
            className={filter === "done" ? "selected" : ""}
            onClick={() => setFilter("done")}
          >
            Completadas
          </button>
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
        </div>
      </div>
      <TaskList
        items={filtered}
        onToggle={onToggle}
        onOpen={onOpen}
        emptyText={
          items.length
            ? "No hay tareas que coincidan con este filtro."
            : "Todavía no hay tareas. Creá la primera acción comercial."
        }
      />
    </section>
  );
}

function TaskList({
  items,
  onToggle,
  onOpen,
  emptyText = "No hay tareas pendientes.",
}) {
  if (!items.length) return <Empty text={emptyText} />;
  return items.map((task) => (
    <article className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
      <button
        className="task-check"
        type="button"
        aria-label={
          task.done
            ? `Marcar ${task.title} como pendiente`
            : `Completar ${task.title}`
        }
        onClick={() => onToggle(task.id)}
      >
        {task.done && <CheckCircle2 size={18} />}
      </button>
      <button
        className="task-main"
        type="button"
        onClick={() => onOpen?.(task.id)}
      >
        <strong>{task.title}</strong>
        <span>
          {task.company} · {formatDate(task.dueDate)}
          {task.trigger ? ` · ${task.trigger}` : ""}
        </span>
      </button>
      <span className={`priority ${(task.priority || "Media").toLowerCase()}`}>
        {task.priority || "Media"}
      </span>
    </article>
  ));
}

function TaskDetail({ task, client, onClose, onToggle, onSave, onOpenClient }) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task || {});
  useEffect(() => setDraft(task || {}), [task?.id]);
  if (!task) return null;
  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, title: draft.title.trim() });
    setEditing(false);
  }
  return (
    <div className="modal-backdrop">
      <section className="modal interaction-detail">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Tarea comercial</span>
            <h2>{task.title}</h2>
            <p>{task.company || "Sin empresa vinculada"}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar tarea"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {editing ? (
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="span-2">
                Acción
                <input
                  required
                  value={draft.title || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <label>
                Vencimiento
                <input
                  required
                  type="date"
                  value={draft.dueDate || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, dueDate: event.target.value })
                  }
                />
              </label>
              <label>
                Prioridad
                <select
                  value={draft.priority || "Media"}
                  onChange={(event) =>
                    setDraft({ ...draft, priority: event.target.value })
                  }
                >
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </select>
              </label>
              <label className="span-2">
                Disparador / contexto
                <input
                  value={draft.trigger || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, trigger: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setDraft(task);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
              <button className="primary" type="submit">
                Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="conversation-detail-grid">
              <Fact label="Vencimiento" value={formatDate(task.dueDate)} />
              <Fact label="Prioridad" value={task.priority || "Media"} />
              <Fact label="Cadencia" value={task.cadence || "Seguimiento"} />
              <Fact
                label="Estado"
                value={task.done ? "Completada" : "Pendiente"}
              />
            </div>
            {task.trigger && (
              <div className="detail-block">
                <span>Por qué aparece hoy</span>
                <p>{task.trigger}</p>
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={onClose}>
                Cerrar
              </button>
              {client && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onOpenClient(client.id)}
                >
                  Ver cliente
                </button>
              )}
              <a
                className="secondary calendar-link"
                href={googleCalendarUrl(task)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en Google Calendar
              </a>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => onToggle(task.id)}
              >
                {task.done ? "Marcar pendiente" : "Completar tarea"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TaskForm({ form, setForm, clients, onClose, onSave }) {
  useModalEscape(onClose);
  const field = (name) => ({
    value: form[name] || "",
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  return (
    <div className="modal-backdrop">
      <form className="modal interaction-detail" onSubmit={onSave}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Agenda comercial</span>
            <h2>Nueva tarea</h2>
            <p>Definí una acción concreta, una fecha y por qué debe hacerse.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar tarea"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Cliente
            <select {...field("clientId")}>
              <option value="">Sin cliente vinculado</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company}
                </option>
              ))}
            </select>
          </label>
          {!form.clientId && (
            <label>
              Empresa / referencia
              <input {...field("company")} placeholder="Opcional" />
            </label>
          )}
          <label className="span-2">
            Acción
            <input
              required
              {...field("title")}
              placeholder="Ej. llamar para confirmar consumo mensual"
            />
          </label>
          <label>
            Vencimiento
            <input required type="date" {...field("dueDate")} />
          </label>
          <label>
            Prioridad
            <select {...field("priority")}>
              <option>Alta</option>
              <option>Media</option>
              <option>Baja</option>
            </select>
          </label>
          <label className="span-2">
            Disparador / contexto
            <input
              {...field("trigger")}
              placeholder="Ej. pasaron 7 días desde la propuesta"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            Crear tarea
          </button>
        </div>
      </form>
    </div>
  );
}

function Pipeline({ clients, onOpenClient, onChangeStage, onDelete, onAdd }) {
  const [draggingId, setDraggingId] = useState(null);
  const [addingStage, setAddingStage] = useState(null);
  const [addingValue, setAddingValue] = useState("");
  function submitAdd(event, stage) {
    event.preventDefault();
    if (!addingValue.trim()) { setAddingStage(null); return; }
    onAdd(addingValue, stage);
    setAddingValue("");
    setAddingStage(null);
  }
  return (
    <div className="content-stack">
      <section className="panel pipeline-summary">
        <div>
          <span className="eyebrow">Trabajo activo</span>
          <h2>{clients.length} cuentas en seguimiento</h2>
          <p>
            La cartera maestra permanece disponible en Clientes. Acá aparecen
            únicamente las cuentas que decidiste trabajar. Arrastrá una
            tarjeta a otra columna para cambiarla de etapa.
          </p>
        </div>
      </section>
      <div className="kanban">
        {PIPELINE.map((stage) => {
          const list = clients.filter((client) => client.stage === stage);
          return (
            <section
              className={`kanban-column ${["Pausado", "Perdido"].includes(stage) ? "inactive" : ""}`}
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) onChangeStage(draggingId, stage);
                setDraggingId(null);
              }}
            >
              <header>
                <strong>{stage}</strong>
                <span>{list.length}</span>
              </header>
              {list.map((client) => (
                <article
                  className="deal-card"
                  key={client.id}
                  draggable
                  onDragStart={() => setDraggingId(client.id)}
                  onDragEnd={() => setDraggingId(null)}
                >
                  <button
                    type="button"
                    className="icon-button deal-card-delete"
                    aria-label="Eliminar cuenta"
                    onClick={(e) => { e.stopPropagation(); onDelete(client.id); }}
                  >
                    <Trash2 size={12} />
                  </button>
                  <button type="button" onClick={() => onOpenClient(client.id)}>
                    <strong>{client.company}</strong>
                    <span>{client.family}</span>
                    <small>{client.contact || "Contacto pendiente"}</small>
                    {client.lossReason && (
                      <small className="loss-reason">{client.lossReason}</small>
                    )}
                  </button>
                </article>
              ))}
              {!list.length && !addingStage && <div className="empty-slot">Sin cuentas</div>}
              {addingStage === stage ? (
                <form className="board-add-card-form" onSubmit={(e) => submitAdd(e, stage)}>
                  <input
                    autoFocus
                    value={addingValue}
                    onChange={(e) => setAddingValue(e.target.value)}
                    onBlur={() => { if (!addingValue.trim()) setAddingStage(null); }}
                    placeholder="Nombre de la empresa"
                  />
                  <div>
                    <button type="submit" className="primary">Agregar</button>
                    <button type="button" className="icon-button" onClick={() => { setAddingStage(null); setAddingValue(""); }} aria-label="Cancelar"><X size={13} /></button>
                  </div>
                </form>
              ) : (
                <button type="button" className="board-add-card" onClick={() => setAddingStage(stage)}>
                  <Plus size={14} /> Cuenta
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Clients({ clients, query, setQuery, onOpenClient }) {
  const [family, setFamily] = useState("Todas");
  const [portfolio, setPortfolio] = useState("Todos");
  const [contact, setContact] = useState("Todos");
  const [review, setReview] = useState("Por validar");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const duplicateCandidates = useMemo(
    () => detectDuplicateClientCandidates(clients),
    [clients],
  );
  const duplicateCounts = duplicateCandidates.reduce(
    (counts, candidate) => ({ ...counts, [candidate.confidence]: counts[candidate.confidence] + 1 }),
    { high: 0, medium: 0, low: 0 },
  );
  const families = [
    "Todas",
    ...new Set(clients.map((client) => client.family || "Sin definir")),
  ];
  const visible = clients.filter(
    (client) =>
      (family === "Todas" || (client.family || "Sin definir") === family) &&
      (portfolio === "Todos" ||
        (portfolio === "Activos"
          ? client.pipelineActive !== false
          : client.pipelineActive === false)) &&
      (contact === "Todos" ||
        (contact === "Con contacto"
          ? Boolean(client.phone || client.email || client.contact)
          : !client.phone && !client.email && !client.contact)) &&
      (review === "Todos" ||
        (review === "Por validar" &&
          (!client.sourceType || client.sourceType === "A confirmar")) ||
        (review === "Clientes" &&
          ["Cliente histórico", "Cliente activo"].includes(
            client.sourceType,
          )) ||
        (review === "Prospectos" &&
          [
            "Relevamiento activo",
            "Prospecto de inteligencia comercial",
          ].includes(client.sourceType)) ||
        (review === "Descartados" && client.sourceType === "No corresponde")),
  );
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages);
  const paged = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [query, family, portfolio, contact, review]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            Cartera unificada · {visible.length} visibles
          </span>
          <h2>Empresas y prospectos</h2>
          <p>
            Revisá manualmente la cartera; dentro de cada ficha podés editar
            su tipo de registro.
          </p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Empresa, CUIT, contacto, teléfono…"
          />
        </label>
      </div>
      <div className="client-filters">
        <select value={review} onChange={(e) => setReview(e.target.value)}>
          <option>Por validar</option>
          <option>Clientes</option>
          <option>Prospectos</option>
          <option>Descartados</option>
          <option>Todos</option>
        </select>
        <select
          value={portfolio}
          onChange={(e) => setPortfolio(e.target.value)}
        >
          <option>Todos</option>
          <option>Activos</option>
          <option>En cartera</option>
        </select>
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          {families.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={contact} onChange={(e) => setContact(e.target.value)}>
          <option>Todos</option>
          <option>Con contacto</option>
          <option>Falta contacto</option>
        </select>
        <button
          type="button"
          className={`duplicate-toggle ${showDuplicates ? "selected" : ""}`}
          onClick={() => setShowDuplicates(!showDuplicates)}
        >
          Posibles duplicados · {duplicateCandidates.length}
        </button>
      </div>
      {showDuplicates && (
        <div className="duplicate-review">
          <div className="duplicate-summary">
            <div><strong>{duplicateCounts.high}</strong><span>Confianza alta</span></div>
            <div><strong>{duplicateCounts.medium}</strong><span>Confianza media</span></div>
            <div><strong>{duplicateCounts.low}</strong><span>Revisar nombre</span></div>
          </div>
          <p className="duplicate-note">
            Son sugerencias de revisión. El CRM no fusiona ni modifica ninguna ficha automáticamente.
          </p>
          <div className="duplicate-list">
            {duplicateCandidates.map((candidate) => {
              const [left, right] = candidate.clientIds.map((id) => clients.find((client) => client.id === id));
              if (!left || !right) return null;
              return (
                <article className="duplicate-card" key={candidate.id}>
                  <span className={`duplicate-confidence ${candidate.confidence}`}>
                    {candidate.confidence === "high" ? "Alta" : candidate.confidence === "medium" ? "Media" : "Baja"}
                  </span>
                  <div className="duplicate-pair">
                    <button type="button" onClick={() => onOpenClient(left.id)}>
                      <strong>{left.company}</strong>
                      <span>{left.contact || left.phone || left.email || "Sin contacto"} · {left.temperature || "Sin temperatura"}</span>
                    </button>
                    <span>posible coincidencia</span>
                    <button type="button" onClick={() => onOpenClient(right.id)}>
                      <strong>{right.company}</strong>
                      <span>{right.contact || right.phone || right.email || "Sin contacto"} · {right.temperature || "Sin temperatura"}</span>
                    </button>
                  </div>
                  <div className="duplicate-signals">
                    {candidate.signals.map((signal) => <span key={signal.type}>{signal.label}</span>)}
                  </div>
                </article>
              );
            })}
            {!duplicateCandidates.length && <Empty text="No se detectaron posibles duplicados." />}
          </div>
        </div>
      )}
      {paged.length ? (
        <>
          <div className="client-table">
            {paged.map((client) => (
              <button
                className="client-row"
                onClick={() => onOpenClient(client.id)}
                key={client.id}
              >
                <div className="avatar">
                  {client.company.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{client.company}</strong>
                  <span>
                    {client.contact ||
                      client.phone ||
                      client.email ||
                      "Datos de contacto pendientes"}
                  </span>
                </div>
                <span>{client.family}</span>
                <span
                  className={`temp ${(client.temperature || "Tibio").toLowerCase()}`}
                >
                  {client.temperature || "Tibio"}
                </span>
                <strong>{client.sourceType || "A confirmar"}</strong>
              </button>
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {safePage} de {pages}
            </span>
            <button
              disabled={safePage === pages}
              onClick={() => setPage(safePage + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      ) : (
        <Empty text="No hay empresas que coincidan con estos filtros." />
      )}
    </section>
  );
}

function Contacts({ clients, query, setQuery, onOpenClient }) {
  const rows = clients.flatMap((client) =>
    clientContacts(client).map((contact) => ({
      ...contact,
      clientId: client.id,
      company: client.company,
      family: client.family || "Sin definir",
    })),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("es-AR");
  const visible = rows.filter(
    (item) =>
      !normalizedQuery ||
      `${item.company} ${item.name} ${item.role} ${item.phone} ${item.email} ${item.family}`
        .toLocaleLowerCase("es-AR")
        .includes(normalizedQuery),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            Directorio unificado · {visible.length} contactos
          </span>
          <h2>Personas y números</h2>
          <p>
            Una empresa puede tener varios contactos. Cada WhatsApp se vincula a
            su empresa sin duplicarla.
          </p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Persona, empresa, teléfono o email…"
          />
        </label>
      </div>
      {visible.length ? (
        <div className="client-table">
          {visible.map((item) => (
            <button
              className="client-row"
              onClick={() => onOpenClient(item.clientId)}
              key={`${item.clientId}-${item.id}`}
            >
              <div className="avatar">
                {(item.name || item.company).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{item.name || "Contacto sin nombre"}</strong>
                <span>
                  {item.phone || item.email || "Datos pendientes"}
                  {item.role ? ` · ${item.role}` : ""}
                </span>
              </div>
              <span>{item.company}</span>
              <span>{item.family}</span>
              <strong>{item.primary ? "Principal" : "Adicional"}</strong>
            </button>
          ))}
        </div>
      ) : (
        <Empty text="Todavía no hay contactos que coincidan con la búsqueda." />
      )}
    </section>
  );
}

function ClientDetail({
  client,
  interactions,
  tasks,
  onClose,
  onOpenInteraction,
  onNewInteraction,
  onNewTask,
  onSave,
}) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client || {});
  const [newContact, setNewContact] = useState({ name: "", role: "", phone: "", email: "" });
  useEffect(() => setDraft(client || {}), [client?.id]);
  if (!client) return null;
  const latest = interactions[0];
  const nextTask = tasks
    .filter((item) => !item.done)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0];
  const field = (name) => ({
    value: draft[name] || "",
    onChange: (event) => setDraft({ ...draft, [name]: event.target.value }),
  });
  function submit(event) {
    event.preventDefault();
    onSave({
      ...draft,
      company: draft.company.trim(),
      contact: draft.contact?.trim() || "",
    });
    setEditing(false);
  }
  const contacts = clientContacts(draft);
  const guidance = buildCommercialGuidance({ client, interactions });
  function changeContact(contactId, fieldName, value) {
    setDraft((current) => updateClientContact(current, contactId, { [fieldName]: value }));
  }
  function addContact() {
    if (!newContact.name.trim() && !newContact.phone.trim() && !newContact.email.trim()) return;
    setDraft((current) => withClientContact(current, newContact));
    setNewContact({ name: "", role: "", phone: "", email: "" });
  }
  return (
    <div className="modal-backdrop">
      <section className="modal client-detail">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Ficha comercial editable</span>
            <h2>{client.company}</h2>
            <p>
              {client.contact || "Contacto pendiente"} ·{" "}
              {client.temperature || "Tibio"} ·{" "}
              {client.pipelineActive === false
                ? "En cartera"
                : client.stage || "Nuevo"}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar ficha"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="review-controls">
          <span>
            Clasificación: <strong>{client.sourceType || "A confirmar"}</strong>
          </span>
          <div>
            <button type="button" className="secondary" onClick={() => onSave({ ...client, sourceType: "Cliente activo" })}>
              Es cliente
            </button>
            <button type="button" className="secondary" onClick={() => onSave({ ...client, sourceType: "Prospecto de inteligencia comercial" })}>
              Es prospecto
            </button>
            <button type="button" className="secondary" onClick={() => onSave({ ...client, sourceType: "No corresponde" })}>
              No corresponde
            </button>
          </div>
        </div>
        {!editing && (
          <div className="commercial-guidance">
            <div className="commercial-guidance-head">
              <div><span className="eyebrow">Copiloto comercial · sin IA paga</span><h3>Cómo avanzar con esta cuenta</h3></div>
              <span className="guidance-stage">{guidance.stage.label}</span>
            </div>
            <div className="guidance-grid">
              <article><span>Objetivo de etapa</span><strong>{guidance.stage.objective}</strong><p>{guidance.stage.advanceWhen}</p></article>
              <article><span>Perfil sugerido</span><strong>{guidance.playbook?.label || "Pendiente de definir"}</strong><p>{guidance.playbook?.motivation || "Completá la familia o industria para recomendar un playbook."}</p></article>
              <article><span>{guidance.objection ? "Objeción detectada" : "Próxima pregunta"}</span><strong>{guidance.objection?.label || guidance.nextQuestion}</strong><p>{guidance.objection ? guidance.objection.explore : guidance.playbook?.nextStep || "Conseguir contexto antes de recomendar."}</p></article>
            </div>
            {guidance.objection && <div className="guidance-response"><strong>Respuesta a construir con E-C-E-R-A</strong><p>{guidance.objection.response}</p><small>Escuchar → Confirmar → Explorar → Responder → Acordar. No enviar automáticamente.</small></div>}
            {!!guidance.crossSellFamilies.length && <p className="guidance-cross-sell"><strong>Venta cruzada posible:</strong> {guidance.crossSellFamilies.join(" · ")}. Confirmar necesidad antes de ofrecer.</p>}
            <details><summary>Por qué aparece esta sugerencia</summary><ul>{guidance.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>Fuente: {guidance.source}</p></details>
          </div>
        )}
        {editing ? (
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>
                Empresa
                <input required {...field("company")} />
              </label>
              <label>
                Razón social
                <input {...field("legalName")} />
              </label>
              <label>
                CUIT
                <input {...field("cuit")} />
              </label>
              <div className="span-2 contact-editor">
                <div className="contact-editor-head">
                  <div>
                    <strong>Personas y medios de contacto</strong>
                    <p>Todos pertenecen a esta misma empresa. Elegí cuál se muestra como contacto principal.</p>
                  </div>
                </div>
                <div className="contact-editor-list">
                  {contacts.map((contact) => (
                    <div className="contact-editor-row" key={contact.id}>
                      <input aria-label="Nombre del contacto" placeholder="Nombre" value={contact.name} onChange={(event) => changeContact(contact.id, "name", event.target.value)} />
                      <input aria-label="Cargo del contacto" placeholder="Cargo / área" value={contact.role} onChange={(event) => changeContact(contact.id, "role", event.target.value)} />
                      <input aria-label="Teléfono del contacto" placeholder="Teléfono" value={contact.phone || contact.whatsappId} onChange={(event) => changeContact(contact.id, "phone", event.target.value)} />
                      <input aria-label="Email del contacto" placeholder="Email" type="email" value={contact.email} onChange={(event) => changeContact(contact.id, "email", event.target.value)} />
                      <select aria-label="Clasificación comercial del contacto" value={contact.nonCommercialCategory || ""} onChange={(event) => {
                        const category = event.target.value;
                        setDraft((current) => updateClientContact(current, contact.id, { nonCommercialCategory: category, commercialStatus: category ? "non-commercial" : "commercial" }));
                      }}>
                        <option value="">Contacto comercial</option>
                        <option>Equipo interno</option>
                        <option>Familiar / personal</option>
                        <option>Proveedor / colaborador</option>
                        <option>Otro no comercial</option>
                      </select>
                      <button className={contact.primary ? "primary contact-primary" : "secondary contact-primary"} type="button" onClick={() => setDraft((current) => setPrimaryClientContact(current, contact.id))}>
                        {contact.primary ? "Principal" : "Hacer principal"}
                      </button>
                      <button className="text-danger" type="button" onClick={() => setDraft((current) => removeClientContact(current, contact.id))}>Quitar</button>
                    </div>
                  ))}
                  <div className="contact-editor-row new-contact">
                    <input aria-label="Nombre del contacto nuevo" placeholder="Nueva persona" value={newContact.name} onChange={(event) => setNewContact({ ...newContact, name: event.target.value })} />
                    <input aria-label="Cargo del contacto nuevo" placeholder="Cargo / área" value={newContact.role} onChange={(event) => setNewContact({ ...newContact, role: event.target.value })} />
                    <input aria-label="Teléfono del contacto nuevo" placeholder="Teléfono" value={newContact.phone} onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })} />
                    <input aria-label="Email del contacto nuevo" placeholder="Email" type="email" value={newContact.email} onChange={(event) => setNewContact({ ...newContact, email: event.target.value })} />
                    <span className="contact-classification-placeholder">Comercial</span>
                    <button className="secondary" type="button" onClick={addContact}>Agregar contacto</button>
                  </div>
                </div>
              </div>
              <label className="span-2">
                Sitio web
                <input {...field("website")} />
              </label>
              <label>
                Provincia
                <input {...field("province")} />
              </label>
              <label>
                Ciudad
                <input {...field("city")} />
              </label>
              <label>
                Familia
                <select {...field("family")}>
                  {FAMILIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de registro
                <select {...field("sourceType")}>
                  <option>Cliente histórico</option>
                  <option>Relevamiento activo</option>
                  <option>Prospecto de inteligencia comercial</option>
                  <option>Cliente activo</option>
                  <option>A confirmar</option>
                  <option>No corresponde</option>
                </select>
              </label>
              <label>
                Temperatura
                <select {...field("temperature")}>
                  <option>Frío</option>
                  <option>Tibio</option>
                  <option>Caliente</option>
                </select>
              </label>
              <label>
                Etapa
                <select {...field("stage")}>
                  {PIPELINE.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <input {...field("priority")} />
              </label>
              <label>
                Proveedor actual
                <input {...field("currentSupplier")} />
              </label>
              <label>
                Decisor / quién aprueba
                <input {...field("decisionMaker")} />
              </label>
              <label>
                Producto principal
                <input {...field("mainProduct")} />
              </label>
              <label>
                Producto a ofrecer
                <input {...field("productPotential")} />
              </label>
              <label>
                Aplica poliuretano / poliurea
                <select {...field("puApplicationType")}>
                  <option value="">No aplica</option>
                  <option>Poliuretano</option>
                  <option>Poliurea</option>
                  <option>Ambos</option>
                </select>
              </label>
              <label>
                Máquina / pistola
                <input {...field("machine")} placeholder="Ej: Fusion AP, Gasper" />
              </label>
              <label>
                Zonas de trabajo
                <input {...field("workZones")} placeholder="Ej: Tandil, sur de Bs As" />
              </label>
              <label>
                Sistemas PU por mes
                <input {...field("systemsPerMonth")} placeholder="Conjuntos de 470kg poliol+isocianato" />
              </label>
              <label>
                Última compra
                <input {...field("lastPurchase")} />
              </label>
              <label>
                Total de compras
                <input {...field("totalPurchases")} />
              </label>
              <label>
                Fecha estimada de recompra
                <input type="date" {...field("repurchaseDate")} />
              </label>
              <label className="span-2">
                Disparador de recompra
                <input {...field("repurchaseTrigger")} />
              </label>
              <label className="span-2">
                Observaciones
                <textarea {...field("notes")} />
              </label>
              {["Pausado", "Perdido"].includes(draft.stage) && (
                <label className="span-2">
                  Motivo de {draft.stage.toLowerCase()}
                  <input required {...field("lossReason")} />
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setDraft(client);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
              <button className="primary" type="submit">
                Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="call-brief">
              <article>
                <span>Última conversación</span>
                <strong>{latest?.summary || "Sin resumen registrado"}</strong>
                <p>{latest?.need || "Necesidad a confirmar"}</p>
              </article>
              <article>
                <span>Próximo paso</span>
                <strong>
                  {nextTask?.title ||
                    client.nextAction ||
                    "Sin seguimiento pendiente"}
                </strong>
                <p>
                  {nextTask
                    ? formatDate(nextTask.dueDate)
                    : client.nextDate
                      ? formatDate(client.nextDate)
                      : "Definir en el próximo contacto"}
                </p>
              </article>
            </div>
            <div className="client-facts">
              <Fact label="Tipo" value={client.sourceType} />
              <Fact label="CUIT" value={client.cuit} />
              <Fact label="Teléfono" value={client.phone} />
              <Fact label="Email" value={client.email} />
              <Fact label="Familia" value={client.family} />
              <Fact
                label="Ubicación"
                value={[client.city, client.province]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Fact label="Última compra" value={client.lastPurchase} />
              <Fact label="Compras" value={client.totalPurchases} />
              <Fact label="Producto principal" value={client.mainProduct} />
              <Fact
                label="Producto potencial"
                value={client.productPotential}
              />
              <Fact label="Proveedor actual" value={client.currentSupplier} />
              <Fact label="Aplica PU/Poliurea" value={client.puApplicationType} />
              <Fact label="Máquina / pistola" value={client.machine} />
              <Fact label="Zonas de trabajo" value={client.workZones} />
              <Fact label="Sistemas PU/mes" value={client.systemsPerMonth} />
              <Fact label="Decisor" value={client.decisionMaker} />
              <Fact label="Fuente" value={client.source} />
              <Fact
                label="Recompra"
                value={
                  client.repurchaseDate
                    ? `${formatDate(client.repurchaseDate)} · ${client.repurchaseTrigger || "sin disparador"}`
                    : client.repurchaseTrigger
                }
              />
              {client.lossReason && (
                <Fact
                  label="Motivo de pausa/pérdida"
                  value={client.lossReason}
                />
              )}
            </div>
            {clientContacts(client).length > 0 && (
              <div className="detail-block">
                <span>Personas y medios de contacto</span>
                <div className="contact-summary-list">
                  {clientContacts(client).map((contact) => (
                    <div className="contact-summary" key={contact.id}>
                      <strong>{contact.name || "Persona sin nombre"}{contact.primary ? " · Principal" : ""}</strong>
                      <p>{[contact.role, contact.phone || contact.whatsappId, contact.email].filter(Boolean).join(" · ") || "Datos pendientes"}</p>
                      {contact.nonCommercialCategory && <span className="contact-status">No comercial · {contact.nonCommercialCategory}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {client.notes && (
              <div className="detail-block">
                <span>Observaciones</span>
                <p>{client.notes}</p>
              </div>
            )}
            <div className="modal-actions client-actions">
              <button className="secondary" type="button" onClick={onClose}>
                Cerrar
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(true)}
              >
                Editar ficha
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  onSave({
                    ...client,
                    pipelineActive: client.pipelineActive === false,
                  })
                }
              >
                {client.pipelineActive === false
                  ? "Agregar al pipeline"
                  : "Sacar del pipeline"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => onNewTask(client)}
              >
                Nueva tarea
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => onNewInteraction(client)}
              >
                Registrar conversación
              </button>
            </div>
            <div className="history">
              <h3>Historial</h3>
              {interactions.length ? (
                interactions.map((item) => (
                  <InteractionRow
                    item={item}
                    expanded
                    key={item.id}
                    liveTemperature={client.temperature}
                    onOpen={(id) => {
                      onClose();
                      onOpenInteraction(id);
                    }}
                  />
                ))
              ) : (
                <Empty text="Sin conversaciones registradas." />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "A confirmar"}</strong>
    </div>
  );
}

function QuickReplies({ myChannels }) {
  const replyChannels = myChannels.filter((key) => QUICK_REPLIES[key]);
  const [channel, setChannel] = useState(replyChannels[0] || "general");
  const [copied, setCopied] = useState("");
  async function copyReply(title, guidance) {
    try {
      await navigator.clipboard.writeText(guidance);
      setCopied(title);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("error");
    }
  }
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Sugerencias editables</span>
            <h2>Biblioteca de respuestas rápidas</h2>
          </div>
          {replyChannels.length > 1 && (
            <div className="segmented">
              {replyChannels.map((key) => (
                <button
                  key={key}
                  className={channel === key ? "selected" : ""}
                  onClick={() => setChannel(key)}
                >
                  {key === "general" ? "General" : key === "penosil" ? "Penosil" : key}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="reply-grid">
          {(QUICK_REPLIES[channel] || []).map(([title, guidance], index) => (
            <article className="reply-card" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{guidance}</p>
              <button onClick={() => copyReply(title, guidance)}>
                {copied === title ? "Copiado ✓" : "Copiar criterio"}
              </button>
            </article>
          ))}
        </div>
        {copied === "error" && (
          <div className="system-message">
            No se pudo copiar automáticamente. Seleccioná el texto manualmente.
          </div>
        )}
        <div className="quality-note">
          <CircleAlert size={19} />
          <p>
            Estas entradas orientan la conversación. Nunca envían mensajes
            automáticamente. Todo dato técnico, precio, stock, descuento o plazo
            debe validarse.
          </p>
        </div>
      </section>
      <Training />
    </div>
  );
}

function Academy({ myChannels, interactions, data, setData }) {
  const [section, setSection] = useState("method");
  return (
    <div className="content-stack">
      <section className="panel academy-hero">
        <div>
          <span className="eyebrow">Sistema Comercial Grupo Poliplast</span>
          <h2>Academia comercial</h2>
          <p>Prepará conversaciones, practicá situaciones reales y convertí cada resultado en aprendizaje para el equipo.</p>
        </div>
        <div className="segmented">
          <button className={section === "method" ? "selected" : ""} onClick={() => setSection("method")}>Método</button>
          <button className={section === "objections" ? "selected" : ""} onClick={() => setSection("objections")}>Objeciones</button>
          <button className={section === "profiles" ? "selected" : ""} onClick={() => setSection("profiles")}>Perfiles</button>
          <button className={section === "library" ? "selected" : ""} onClick={() => setSection("library")}>Biblioteca y práctica</button>
          <button className={section === "coach" ? "selected" : ""} onClick={() => setSection("coach")}>Evaluar conversaciones</button>
        </div>
      </section>
      {["method", "objections", "profiles"].includes(section) && <CommercialKnowledge section={section} />}
      {section === "library" && <QuickReplies myChannels={myChannels} />}
      {section === "coach" && (
        <>
          <PriceMemory sales={data.sales || []} />
          <Coach interactions={interactions} data={data} setData={setData} />
        </>
      )}
    </div>
  );
}

function CommercialKnowledge({ section }) {
  const [search, setSearch] = useState("");
  const objections = findObjections(search);
  return (
    <section className="panel commercial-knowledge">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Contenido {KNOWLEDGE_META.status} · {KNOWLEDGE_META.version}</span>
          <h2>{section === "method" ? "Proceso y método E-C-E-R-A" : section === "objections" ? "Biblioteca única de objeciones" : "Perfiles y playbooks"}</h2>
        </div>
        {section === "objections" && <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar objeción o respuesta…" /></label>}
      </div>
      {section === "method" && (
        <>
          <div className="ecera-strip">{ECERA.map((step, index) => <article key={step.id}><span>{index + 1}</span><strong>{step.label}</strong><p>{step.guidance}</p></article>)}</div>
          <div className="knowledge-grid stages">{COMMERCIAL_STAGES.map((stage, index) => <article key={stage.id}><span>Etapa {index + 1}</span><h3>{stage.label}</h3><p>{stage.objective}</p><small>Avanza cuando: {stage.advanceWhen}</small></article>)}</div>
        </>
      )}
      {section === "objections" && <div className="knowledge-grid objections">{objections.map((item) => <article key={item.id}><span>Objeción</span><h3>{item.label}</h3><p><strong>Puede significar:</strong> {item.meaning}</p><p><strong>Explorar:</strong> {item.explore}</p><small><strong>Respuesta a construir:</strong> {item.response}</small></article>)}{!objections.length && <Empty text="No encontramos una objeción con ese criterio." />}</div>}
      {section === "profiles" && <div className="knowledge-grid profiles">{PLAYBOOKS.map((item) => <article key={item.id}><span>{item.families.join(" · ")}</span><h3>{item.label}</h3><p><strong>Busca:</strong> {item.motivation}</p><p><strong>Objeción típica:</strong> {item.typicalObjection}</p><small><strong>Próximo paso:</strong> {item.nextStep}</small></article>)}</div>}
      <div className="quality-note"><CircleAlert size={19} /><p>Fuente: Sistema Comercial Grupo Poliplast. Los criterios orientan; precio, stock, condiciones y datos técnicos deben verificarse antes de responder.</p></div>
    </section>
  );
}

function Coach({ interactions, data, setData }) {
  const [selected, setSelected] = useState(interactions[0]?.id || "");
  const interaction = interactions.find((item) => item.id === selected);
  const [scores, setScores] = useState(
    Object.fromEntries(RUBRIC.map(([id]) => [id, 0])),
  );
  const [feedback, setFeedback] = useState({
    good: "",
    missing: "",
    risk: "",
    suggested: "",
    learning: "",
  });
  const total = Object.values(scores).reduce(
    (sum, value) => sum + Number(value),
    0,
  );
  const band = scoreBand(total);

  useEffect(() => {
    if (interaction?.evaluation) {
      setScores(interaction.evaluation.scores);
      setFeedback(interaction.evaluation.feedback);
      return;
    }
    setScores(Object.fromEntries(RUBRIC.map(([id]) => [id, 0])));
    setFeedback({
      good: "",
      missing: "",
      risk: "",
      suggested: "",
      learning: "",
    });
  }, [selected]);

  function saveEvaluation() {
    if (!interaction) return;
    const evaluation = {
      scores,
      total,
      band: band.label,
      feedback,
      evaluatedAt: new Date().toISOString(),
    };
    setData({
      ...data,
      interactions: data.interactions.map((item) =>
        item.id === interaction.id ? { ...item, evaluation } : item,
      ),
    });
  }

  if (!interactions.length)
    return (
      <section className="panel">
        <Empty text="Registrá una conversación para poder evaluarla." />
      </section>
    );
  return (
    <div className="coach-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Conversación</span>
            <h2>Entrenador comercial</h2>
          </div>
          <Sparkles size={22} />
        </div>
        <label className="coach-select">
          Elegir conversación
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {interactions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.company} ·{" "}
                {new Date(item.createdAt).toLocaleDateString("es-AR")}
              </option>
            ))}
          </select>
        </label>
        {interaction && (
          <div className="conversation-brief">
            <strong>{interaction.company}</strong>
            <span>
              {interaction.contact || "Contacto sin identificar"} ·{" "}
              {interaction.family}
            </span>
            <p>{interaction.summary || interaction.need || "Sin resumen"}</p>
          </div>
        )}
        <div className="score-summary">
          <div>
            <strong>
              {total}
              <small>/28</small>
            </strong>
            <span className={band.tone}>{band.label}</span>
          </div>
          <p>0–14 reforzar · 15–21 aceptable · 22–28 modelo</p>
        </div>
      </section>
      <section className="panel rubric-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Rúbrica Claude</span>
            <h2>14 criterios</h2>
          </div>
        </div>
        <div className="rubric-list">
          {RUBRIC.map(([id, label, question]) => (
            <div className="rubric-row" key={id}>
              <div>
                <strong>{label}</strong>
                <span>{question}</span>
              </div>
              <div className="score-buttons">
                {[0, 1, 2].map((value) => (
                  <button
                    className={scores[id] === value ? "selected" : ""}
                    onClick={() => setScores({ ...scores, [id]: value })}
                    key={value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel feedback-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Devolución</span>
            <h2>Aprendizaje de la conversación</h2>
          </div>
        </div>
        <div className="feedback-grid">
          {[
            ["good", "Qué se hizo bien"],
            ["missing", "Qué faltó preguntar"],
            ["risk", "Riesgo detectado"],
            ["suggested", "Próximo mensaje sugerido"],
            ["learning", "Aprendizaje reutilizable"],
          ].map(([id, label]) => (
            <label key={id}>
              {label}
              <textarea
                value={feedback[id]}
                onChange={(e) =>
                  setFeedback({ ...feedback, [id]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <button className="primary" onClick={saveEvaluation}>
          Guardar evaluación
        </button>
      </section>
    </div>
  );
}

function Training() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Formación</span>
          <h2>Role-play semanal</h2>
        </div>
        <GraduationCap size={22} />
      </div>
      <div className="role-grid">
        {ROLE_PLAYS.map(([title, goal], index) => (
          <article key={title}>
            <span>Ejercicio {index + 1}</span>
            <strong>{title}</strong>
            <p>{goal}</p>
          </article>
        ))}
      </div>
      <div className="cadence-grid">
        <Goal title="Diaria · 5 min" text="Revisar puntajes bajos y riesgos." />
        <Goal
          title="Semanal · 30 min"
          text="Un role-play y 2–3 conversaciones."
        />
        <Goal title="Mensual · 60 min" text="Tendencias, recompra y ajustes." />
      </div>
    </section>
  );
}

function TestCleanupPanel({ data, setData, session }) {
  const [message, setMessage] = useState("");
  const candidates = useMemo(() => testDataCandidates(data), [data]);
  const count = Object.values(candidates).reduce(
    (total, items) => total + items.length,
    0,
  );

  async function clean() {
    if (!count) return;
    const cleaned = removeExplicitTestData(data);
    try {
      if (onlineConfigured && session?.user)
        await saveOnlineState(session.user.id, session.user.email, cleaned);
      setData(cleaned);
      setMessage(
        `Listo: se retiraron ${count} registros inequívocos de prueba. Todo dato real o dudoso fue conservado.`,
      );
    } catch {
      setMessage(
        "No se pudo confirmar la limpieza online. No se aplicó ningún borrado parcial.",
      );
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Higiene de datos</span>
          <h2>Pruebas de desarrollo</h2>
        </div>
        <Database size={22} />
      </div>
      <p>
        La detección es deliberadamente conservadora: solo incluye nombres y
        textos explícitos de prueba.
      </p>
      <div className="modal-actions">
        <button
          className="secondary"
          type="button"
          disabled={!count}
          onClick={clean}
        >
          {count
            ? `Eliminar ${count} registros de prueba`
            : "Sin pruebas pendientes"}
        </button>
      </div>
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}

function Profile({ data, setData, session }) {
  const [name, setName] = useState(data.profileName || "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function saveName(event) {
    event.preventDefault();
    setData({ ...data, profileName: name.trim() });
    setMessage("Nombre guardado.");
  }

  async function changePassword(event) {
    event.preventDefault();
    if (password.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setMessage("Actualizando contraseña…");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message || "No se pudo actualizar la contraseña.");
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    setMessage("Contraseña actualizada.");
  }

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Tu cuenta</span>
            <h2>Perfil</h2>
          </div>
          <UserCog size={22} />
        </div>
        <form className="form-grid" onSubmit={saveName}>
          <label>
            Nombre y apellido
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej: Felipe Cnokaert"
            />
          </label>
          <label>
            Correo
            <input value={session?.user?.email || ""} disabled />
          </label>
          <div className="modal-actions span-2">
            <button className="primary" type="submit">Guardar nombre</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Seguridad</span>
            <h2>Cambiar contraseña</h2>
          </div>
        </div>
        <form className="form-grid" onSubmit={changePassword}>
          <label>
            Contraseña nueva
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <label>
            Repetir contraseña
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <div className="modal-actions span-2">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </div>
        </form>
        {message && <div className="system-message">{message}</div>}
      </section>
    </div>
  );
}

function DataSettings({ data, setData, session, syncStatus }) {
  const myChannels = channelsForEmail(session?.user?.email);
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [exportFamily, setExportFamily] = useState("Todas");
  const [pendingClientImport, setPendingClientImport] = useState(null);

  async function startWhatsAppConnection() {
    setConnecting(true);
    setMessage("Abriendo conexión segura con Meta…");
    try {
      const result = await connectWhatsApp(session);
      setMessage(
        `WhatsApp conectado${result.phoneNumberId ? ` · Phone ID ${result.phoneNumberId}` : ""}. El CRM ya puede recibir eventos del número autorizado.`,
      );
    } catch (error) {
      setMessage(error.message || "No se pudo completar la conexión con Meta.");
    } finally {
      setConnecting(false);
    }
  }

  async function activateOfficialChannels() {
    if (!session?.access_token) return;
    setConnecting(true);
    setMessage(myChannels.length > 1 ? "Sincronizando tus canales…" : "Sincronizando tu WhatsApp…");
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
      setMessage("Listo. Si igual no te llegan mensajes, revisá en el Business Manager de Meta que el número tenga activada la coexistencia.");
    } catch (error) {
      setMessage(
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
    setMessage(
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
      setMessage(
        result.skipped
          ? "La cartera maestra ya está incorporada. Tus ediciones quedan preservadas."
          : `Cartera consolidada: ${result.addedClients} fichas nuevas y ${result.enrichedClients} fichas enriquecidas, sin crear tareas masivas.`,
      );
    } catch (error) {
      setMessage(error.message || "No se pudo cargar la cartera protegida.");
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
    setMessage("Respaldo exportado correctamente.");
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
    setMessage(
      `CSV exportado: ${clients.length} fichas${exportFamily === "Todas" ? "" : ` de ${exportFamily}`}.`,
    );
  }

  async function importClients(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = mergeClientsCsv(data.clients, await readFileSmart(file));
      setPendingClientImport({ ...result, fileName: file.name });
      setMessage(
        `Vista previa lista: ${result.added} empresas nuevas, ${result.updated} actualizadas y ${result.skipped} filas omitidas. Todavía no se guardó nada.`,
      );
    } catch (error) {
      setMessage(error.message || "No se pudo importar el CSV.");
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
    setMessage(
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
      setMessage(
        `Respaldo importado: ${payload.data.clients.length} clientes y ${payload.data.interactions.length} conversaciones.`,
      );
    } catch {
      setMessage(
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
      setMessage(
        `${valid.length} mensajes nuevos incorporados a la bandeja; ${incoming.length - valid.length} duplicados o eventos de sistema omitidos.`,
      );
    } catch {
      setMessage(
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
        {message && <div className="system-message">{message}</div>}
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
    </div>
  );
}

const SIGNUP_DOMAIN = "@grupopoliplast.com.ar";

function LoginScreen() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup' | 'magic' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submitPassword(event) {
    event.preventDefault();
    if (mode === "signup" && !email.trim().toLocaleLowerCase().endsWith(SIGNUP_DOMAIN)) {
      setMessage(`Las cuentas nuevas se crean con un correo ${SIGNUP_DOMAIN}.`);
      return;
    }
    setMessage(mode === "signup" ? "Creando tu cuenta…" : "Ingresando…");
    const { error, data } =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
    if (error) {
      setMessage(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : error.message,
      );
      return;
    }
    setMessage(
      mode === "signup" && !data.session
        ? "Cuenta creada. Revisá tu correo para confirmarla y después ingresá."
        : "",
    );
  }

  async function submitReset(event) {
    event.preventDefault();
    setMessage("Enviando enlace…");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setMessage(
      error
        ? error.message
        : "Si ese correo tiene una cuenta, te llegó un enlace para elegir una contraseña nueva.",
    );
  }

  async function submitMagicLink(event) {
    event.preventDefault();
    setMessage("Enviando acceso…");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setMessage(
      error
        ? "No se pudo enviar el acceso. Verificá que el usuario esté habilitado."
        : "Revisá tu correo y abrí el enlace de acceso.",
    );
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <img
          className="login-logo"
          src="/poliplast-logo.png"
          alt="Grupo Poliplast"
        />
        <span className="eyebrow">Acceso privado</span>
        <h1>Poliplast Sales Copilot</h1>
        <p>
          {mode === "signup"
            ? `Creá tu cuenta con un correo ${SIGNUP_DOMAIN} — cada usuario tiene su propio espacio de trabajo.`
            : mode === "magic"
              ? "Ingresá con el correo habilitado. No necesitás recordar una contraseña."
              : mode === "reset"
                ? "Ingresá tu correo y te mandamos un enlace para elegir una contraseña nueva."
                : "Ingresá con tu correo y contraseña."}
        </p>
        {mode === "reset" ? (
          <form onSubmit={submitReset}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@grupopoliplast.com.ar"
              />
            </label>
            <button className="primary" type="submit">
              Enviar enlace
            </button>
          </form>
        ) : mode === "magic" ? (
          <form onSubmit={submitMagicLink}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
              />
            </label>
            <button className="primary" type="submit">
              Enviar enlace de acceso
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@grupopoliplast.com.ar"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button className="primary" type="submit">
              {mode === "signup" ? "Crear cuenta" : "Ingresar"}
            </button>
          </form>
        )}
        {message && <div className="system-message">{message}</div>}
        <div className="login-switch">
          {mode !== "signin" && (
            <button type="button" className="link-button" onClick={() => { setMode("signin"); setMessage(""); }}>
              Ya tengo cuenta
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="link-button" onClick={() => { setMode("signup"); setMessage(""); }}>
              Crear cuenta nueva
            </button>
          )}
          {mode === "signin" && (
            <button type="button" className="link-button" onClick={() => { setMode("reset"); setMessage(""); }}>
              Olvidé mi contraseña
            </button>
          )}
          {mode !== "magic" && (
            <button type="button" className="link-button" onClick={() => { setMode("magic"); setMessage(""); }}>
              Prefiero un enlace por correo
            </button>
          )}
        </div>
        <div className="login-legal">
          <a href="/privacidad.html">Privacidad</a>
          <a href="/terminos.html">Términos</a>
          <a href="/eliminacion-datos.html">Eliminación de datos</a>
        </div>
      </section>
    </div>
  );
}

function Splash({ text }) {
  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="brand-mark">P</div>
        <h1>Poliplast Sales Copilot</h1>
        <p>{text}</p>
      </section>
    </div>
  );
}

function InteractionForm({ form, setForm, myChannels = [], editing = false, onClose, onSave }) {
  const formChannels = Object.entries(CHANNELS).filter(([key]) => myChannels.includes(key) || ["call", "email"].includes(key));
  useModalEscape(onClose);
  const field = (name) => ({
    value: form[name],
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSave}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">
              {editing ? "Corrección de registro" : "Registro posterior"}
            </span>
            <h2>{editing ? "Editar conversación" : "Nueva conversación"}</h2>
            <p>
              {editing
                ? "Corregí el registro sin crear una conversación duplicada."
                : "Guardá lo esencial. La clasificación avanzada es opcional."}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Empresa
            <input
              required
              {...field("company")}
              placeholder="Nombre del cliente"
            />
          </label>
          <label>
            Persona / cargo
            <input {...field("contact")} placeholder="Ej. María · Compras" />
          </label>
          <label>
            Canal
            <select {...field("channel")}>
              {formChannels.map(([key, item]) => (
                <option value={key} key={key}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Familia
            <select {...field("family")}>
              {FAMILIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="span-2">
            ¿Qué hablaron?
            <textarea
              {...field("summary")}
              placeholder="Resumen breve y factual"
            />
          </label>
          <label className="span-2">
            Necesidad detectada
            <textarea
              {...field("need")}
              placeholder="Problema, aplicación, volumen o urgencia"
            />
          </label>
          <div className="form-readonly-note">
            <strong>Temperatura comercial</strong>
            <span>
              {form.temperature || "Tibio"} · se administra una sola vez desde
              la ficha del cliente.
            </span>
          </div>
          <label>
            Etapa
            <select {...field("stage")}>
              {PIPELINE.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha próxima
            <input type="date" {...field("nextDate")} />
          </label>
          <label className="span-2">
            Próxima acción
            <input
              {...field("nextAction")}
              placeholder="Ej. llamar para confirmar consumo"
            />
          </label>
          {["Pausado", "Perdido"].includes(form.stage) && (
            <label className="span-2">
              Motivo de {form.stage.toLowerCase()}
              <input
                required
                {...field("lossReason")}
                placeholder="Motivo concreto para aprender o retomar"
              />
            </label>
          )}
        </div>
        <details className="advanced-fields">
          <summary>
            Agregar clasificación comercial, proveedor y recompra
          </summary>
          <div className="form-grid">
            <label>
              Tipo de cliente
              <select {...field("clientType")}>
                {CLASSIFICATIONS.clientTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Industria
              <select {...field("industry")}>
                {CLASSIFICATIONS.industries.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Encaje
              <select {...field("fit")}>
                {CLASSIFICATIONS.fit.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Urgencia
              <select {...field("urgency")}>
                {CLASSIFICATIONS.urgency.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Potencial
              <select {...field("potential")}>
                {CLASSIFICATIONS.potential.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Objeción
              <input
                {...field("objection")}
                placeholder="Ej. ya tiene proveedor"
              />
            </label>
            <label>
              Proveedor actual
              <input
                {...field("currentSupplier")}
                placeholder="Nombre o sin proveedor"
              />
            </label>
            <label>
              Decisor / quién aprueba
              <input
                {...field("decisionMaker")}
                placeholder="Persona, cargo o a confirmar"
              />
            </label>
            <label>
              Fecha estimada de recompra
              <input type="date" {...field("repurchaseDate")} />
            </label>
            <label>
              Disparador de recompra
              <input
                {...field("repurchaseTrigger")}
                placeholder="Ej. consumo mensual, fin de obra"
              />
            </label>
          </div>
        </details>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            {editing ? "Guardar cambios" : "Guardar conversación"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Goal({ title, text }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <MessageCircle size={24} />
      <p>{text}</p>
    </div>
  );
}
