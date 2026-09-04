import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
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
  GraduationCap,
  Sparkles,
  Database,
  Download,
  Upload,
  Users,
  X,
  Link2,
  LayoutGrid,
} from "lucide-react";
import {
  CLASSIFICATIONS,
  QUICK_REPLIES,
  ROLE_PLAYS,
  RUBRIC,
  scoreBand,
} from "./knowledge";
import {
  loadOnlineState,
  mergeWorkspaceState,
  onlineConfigured,
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
import Sales from "./Sales";
import Board from "./Board";
import PriceMemory from "./PriceMemory";
import { moveCard, reorderList } from "./board-model.mjs";
import { wasAnsweredOutside } from "./answered-outside.mjs";
import {
  fetchCommercialMaster,
  mergeCommercialMaster,
} from "./commercial-master";
import { COMMERCIAL_PLAN } from "./commercial-plan";
import {
  groupWhatsAppThreads,
  isIgnoredWhatsAppContact,
  whatsappContactIdentity,
  whatsappContactKey,
} from "./whatsapp-threads.mjs";
import { addInteractionOnce, groupConversationHistory } from "./conversation-history.mjs";
import { clientsToCsv, mergeClientsCsv } from "./client-csv.mjs";
import { removeExplicitTestData, testDataCandidates } from "./data-hygiene.mjs";
import {
  attachWhatsAppContact,
  clientContacts,
  clientSearchText,
  findClientByWhatsApp,
} from "./client-contacts.mjs";

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
  call: { name: "Llamada", number: "", profile: "", color: "#3b6d9b" },
  email: { name: "Email", number: "", profile: "", color: "#6b5aa6" },
};

// "Registrar conversación" solo tiene sentido donde se sigue a un cliente
// puntual, no en todos los módulos.
const LOG_CONVERSATION_VIEWS = ["dashboard", "conversations", "pipeline", "clients", "contacts"];

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
const FAMILIES = [
  "Sin definir",
  "Poliuretano",
  "Poliurea",
  "PURMAC",
  "Penosil",
  "Carrozados",
  "Resinplast",
  "Baldes",
  "Pisos",
  "EPP",
  "Almohadas",
  "PRFV",
  "Imperpur",
  "Foam Factory",
  "Otra",
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
const PENOSIL_V017_CUTOFF = "2026-09-01T23:09:45.829Z";
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
  salesGoals: {},
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
  const [data, setData] = useState(loadState);
  const [session, setSession] = useState(null);
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
  const [penosilCleanupRunning, setPenosilCleanupRunning] = useState(false);
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
    loadOnlineState()
      .then(({ state, statusEvents }) => {
        if (!active) return;
        const nextState = { ...initialState, ...state, inbox: state.inbox || [] };
        if (nextState.historyResetVersion !== HISTORY_RESET_VERSION) {
          nextState.interactions = [];
          nextState.historyResetVersion = HISTORY_RESET_VERSION;
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
            event.channel === "penosil" ||
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
          filter: "workspace_key=eq.grupo-poliplast",
        },
        ({ new: row }) => {
          if (!row?.data || row.updated_by === session.user.id) return;
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

  useEffect(() => {
    if (!remoteReady || !session?.access_token || penosilCleanupRunning) return;
    const obsoleteIds = data.inbox
      .filter(
        (item) =>
          item.channel === "penosil" &&
          item.phone_number_id === "browser-bridge:penosil" &&
          item.occurred_at < PENOSIL_V017_CUTOFF,
      )
      .map((item) => item.event_id);
    if (!obsoleteIds.length) return;
    setPenosilCleanupRunning(true);
    fetch("/api/inbox-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ eventIds: obsoleteIds }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("cleanup failed");
        setData((current) => ({
          ...current,
          inbox: current.inbox.filter(
            (item) => !obsoleteIds.includes(item.event_id),
          ),
          dismissedInboxEventIds: [
            ...new Set([
              ...(current.dismissedInboxEventIds || []),
              ...obsoleteIds,
            ]),
          ],
        }));
      })
      .catch(() => setPenosilCleanupRunning(false));
  }, [remoteReady, session?.access_token, data.inbox, penosilCleanupRunning]);

  useEffect(() => {
    if (!remoteReady) return;
    let active = true;
    setData((current) => mergeCommercialCohort(current).state);
    fetchCommercialMaster(session)
      .then((clients) => {
        if (active)
          setData((current) => mergeCommercialMaster(current, clients).state);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [remoteReady, session?.access_token]);

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
      temperature: form.temperature,
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
              priority: form.temperature === "Caliente" ? "Alta" : "Media",
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
    setData({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done, updatedAt: stamp } : task,
      ),
    });
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

  function deleteOpportunity(id) {
    if (!window.confirm("¿Eliminar esta oportunidad del CRM?")) return;
    setData({
      ...data,
      opportunities: data.opportunities.filter((item) => item.id !== id),
      tasks: data.tasks.filter((item) => item.opportunityId !== id),
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
    setData((current) => ({
      ...current,
      boardLists: (current.boardLists || []).filter((item) => item.id !== id),
      boardCards: (current.boardCards || []).filter((item) => item.listId !== id),
    }));
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
    setData((current) => ({
      ...current,
      boardCards: (current.boardCards || []).filter((item) => item.id !== id),
    }));
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

  function deleteSale(id) {
    if (!window.confirm("¿Eliminar esta venta del registro?")) return;
    setData((current) => ({
      ...current,
      sales: (current.sales || []).filter((item) => item.id !== id),
    }));
  }

  function saveSalesGoal(period, count) {
    setData((current) => ({
      ...current,
      salesGoals: { ...(current.salesGoals || {}), [period]: count },
    }));
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

  function deleteInbox(eventId) {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const name = event.customer_name || event.customer_wa_id || "este contacto";
    if (
      !window.confirm(
        `¿Eliminar del CRM la memoria de ${name}? Esto no borra el chat original de WhatsApp.`,
      )
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

  function batchDeleteInbox(eventIds) {
    const keys = new Set(
      data.inbox
        .filter((item) => eventIds.includes(item.event_id))
        .map(whatsappThreadKey),
    );
    if (
      !keys.size ||
      !window.confirm(
        `¿Eliminar del CRM ${keys.size} ${keys.size === 1 ? "contacto seleccionado" : "contactos seleccionados"}? Los chats originales de WhatsApp no se modifican.`,
      )
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

  function deleteLegacyInbox(eventId) {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    if (
      !window.confirm(
        "¿Quitar del CRM esta captura anterior? El chat original de WhatsApp no se modifica.",
      )
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

  function deleteAllLegacyInbox(items) {
    if (!items.length) return;
    if (
      !window.confirm(
        `¿Quitar del CRM las ${items.length} capturas en cuarentena? Los chats originales de WhatsApp no se modifican.`,
      )
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

  function updateClient(updatedClient) {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      clients: current.clients.map((client) =>
        client.id === updatedClient.id
          ? { ...client, ...updatedClient, updatedAt: stamp }
          : client,
      ),
      tasks: current.tasks.map((task) =>
        task.clientId === updatedClient.id
          ? {
              ...task,
              company: updatedClient.company || task.company,
              updatedAt: stamp,
            }
          : task,
      ),
    }));
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
      ["board", "Tablero", LayoutGrid],
      ["plan", "Plan comercial", CalendarCheck],
    ]],
    ["Cartera", [
      ["clients", "Empresas", Building2],
      ["contacts", "Contactos", Users],
    ]],
    ["Recursos", [
      ["replies", "Biblioteca", BookOpen],
      ["coach", "Entrenamiento", GraduationCap],
    ]],
    ["Sistema", [
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
            <span
              className={`sync-pill ${syncStatus === "Sincronizado" ? "ok" : ""}`}
            >
              {syncStatus}
            </span>
            <div className="profile-pill">FC</div>
            {LOG_CONVERSATION_VIEWS.includes(view) && (
              <button className="primary" onClick={() => setShowForm(true)}>
                <Plus size={18} /> Registrar conversación
              </button>
            )}
          </div>
        </header>

        {view !== "inbox" && (
          <section className="channel-strip">
            {["general"].map((key) => (
              <div className="channel-card" key={key}>
                <span
                  className="channel-dot"
                  style={{ background: displayedChannel(key).color }}
                />
                <div>
                  <strong>{displayedChannel(key).name}</strong>
                  <span>
                    {displayedChannel(key).profile} ·{" "}
                    {displayedChannel(key).number}
                  </span>
                </div>
                <span className={`status ${displayedChannel(key).statusTone}`}>
                  {displayedChannel(key).status}
                </span>
              </div>
            ))}
          </section>
        )}

        {view === "dashboard" && (
          <Dashboard
            metrics={metrics}
            tasks={data.tasks}
            interactions={data.interactions}
            onToggle={toggleTask}
            onOpenTask={setSelectedTaskId}
            onOpenInteraction={setSelectedInteractionId}
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
          />
        )}
        {view === "sales" && (
          <Sales
            items={data.sales || []}
            goals={data.salesGoals || {}}
            onSaveGoal={saveSalesGoal}
            onSave={saveSale}
            onDelete={deleteSale}
          />
        )}
        {view === "board" && (
          <Board
            lists={data.boardLists || []}
            cards={data.boardCards || []}
            onSaveList={saveBoardList}
            onDeleteList={deleteBoardList}
            onReorderList={reorderBoardList}
            onSaveCard={saveBoardCard}
            onDeleteCard={deleteBoardCard}
            onMoveCard={moveBoardCard}
          />
        )}
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
        {view === "plan" && (
          <CommercialPlan
            checks={data.planChecks || {}}
            onToggle={(id) =>
              setData((current) => ({
                ...current,
                planChecks: {
                  ...(current.planChecks || {}),
                  [id]: !current.planChecks?.[id],
                },
              }))
            }
            clients={data.clients}
          />
        )}
        {view === "replies" && <QuickReplies />}
        {view === "coach" && (
          <div className="content-stack">
            <PriceMemory sales={data.sales || []} />
            <Coach
              interactions={data.interactions}
              data={data}
              setData={setData}
            />
          </div>
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

function Dashboard({
  metrics,
  tasks,
  interactions,
  onToggle,
  onOpenTask,
  onOpenInteraction,
}) {
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
  ];
  return (
    <div className="content-stack">
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
      <section className="panel goals">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Plan comercial</span>
            <h2>Cadencia de resultados</h2>
          </div>
          <Target size={22} />
        </div>
        <div className="goal-grid">
          <Goal
            title="Diario"
            text="Conversar, registrar y definir el próximo paso."
          />
          <Goal
            title="Semanal"
            text="15 nuevos · 8–10 efectivos · 2–3 propuestas."
          />
          <Goal
            title="Mensual"
            text="Clientes nuevos, conversión, recompra y cross-selling."
          />
          <Goal
            title="Trimestral"
            text="10–15 clientes nuevos e incremento outbound."
          />
        </div>
      </section>
    </div>
  );
}

function Conversations({ items, clients, onOpen, onOpenClient }) {
  const [query, setQuery] = useState("");
  const conversations = groupConversationHistory(items);
  const clientIds = new Set(clients.map((client) => client.id));
  const filtered = conversations.filter((item) =>
    `${item.company || ""} ${item.contact || ""} ${item.summary || ""} ${item.need || ""} ${item.family || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
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
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente o conversación…"
          />
        </label>
      </div>
      {filtered.length ? (
        <div className="conversation-list">
          {filtered.map((item) => {
            const validClientIds = (item.clientIds || [item.clientId]).filter((id) => clientIds.has(id));
            const hasClient = validClientIds.length === 1;
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
                    {new Date(item.latestContactAt).toLocaleTimeString(
                      "es-AR",
                      { hour: "2-digit", minute: "2-digit", hour12: false },
                    )}
                  </time>
                  <span
                    className={`temp ${(item.temperature || "Tibio").toLowerCase()}`}
                  >
                    {item.temperature || "Tibio"}
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
    items.filter((item) => !item.legacyCapture),
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

function InboxDraftModal({ draft, setDraft, onClose, onConfirm }) {
  useModalEscape(onClose);
  const update = (name, value) =>
    setDraft({ ...draft, form: { ...draft.form, [name]: value } });
  const form = draft.form;
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

function InteractionRow({ item, expanded = false, onOpen }) {
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
        <span className={`temp ${(item.temperature || "Tibio").toLowerCase()}`}>
          {item.temperature || "Tibio"}
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
          <Fact label="Temperatura" value={interaction.temperature} />
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

function Pipeline({ clients, onOpenClient }) {
  return (
    <div className="content-stack">
      <section className="panel pipeline-summary">
        <div>
          <span className="eyebrow">Trabajo activo</span>
          <h2>{clients.length} cuentas en seguimiento</h2>
          <p>
            La cartera maestra permanece disponible en Clientes. Acá aparecen
            únicamente las cuentas que decidiste trabajar.
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
            >
              <header>
                <strong>{stage}</strong>
                <span>{list.length}</span>
              </header>
              {list.map((client) => (
                <button
                  className="deal-card"
                  key={client.id}
                  onClick={() => onOpenClient(client.id)}
                >
                  <strong>{client.company}</strong>
                  <span>{client.family}</span>
                  <small>{client.contact || "Contacto pendiente"}</small>
                  {client.lossReason && (
                    <small className="loss-reason">{client.lossReason}</small>
                  )}
                </button>
              ))}
              {!list.length && <div className="empty-slot">Sin cuentas</div>}
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
  const [page, setPage] = useState(1);
  const pageSize = 50;
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
      </div>
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
              <label>
                Persona / cargo
                <input {...field("contact")} />
              </label>
              <label>
                Teléfono
                <input {...field("phone")} />
              </label>
              <label>
                Email
                <input type="email" {...field("email")} />
              </label>
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

function CommercialPlan({ checks, onToggle, clients }) {
  const [month, setMonth] = useState("Todos");
  const months = [
    "Todos",
    ...new Set(COMMERCIAL_PLAN.map((item) => item.month)),
  ];
  const visible =
    month === "Todos"
      ? COMMERCIAL_PLAN
      : COMMERCIAL_PLAN.filter((item) => item.month === month);
  const completed = COMMERCIAL_PLAN.filter((item) => checks[item.id]).length;
  const familyCounts = Object.fromEntries(
    FAMILIES.map((family) => [
      family,
      clients.filter((client) => client.family === family).length,
    ]),
  );
  return (
    <div className="content-stack">
      <section className="panel plan-hero">
        <div>
          <span className="eyebrow">Roadmap absorbido en el CRM</span>
          <h2>Plan comercial por familias</h2>
          <p>
            Los checks ahora se comparten con el equipo. Completar una etapa no
            modifica clientes ni envía mensajes.
          </p>
        </div>
        <div className="plan-progress">
          <strong>
            {Math.round((completed / COMMERCIAL_PLAN.length) * 100)}%
          </strong>
          <span>
            {completed} de {COMMERCIAL_PLAN.length} hitos
          </span>
        </div>
      </section>
      <section className="panel">
        <div className="list-toolbar">
          <div className="segmented">
            {months.map((item) => (
              <button
                key={item}
                className={month === item ? "selected" : ""}
                onClick={() => setMonth(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="plan-list">
          {visible.map((item) => (
            <article
              className={`plan-row ${checks[item.id] ? "done" : ""}`}
              key={item.id}
            >
              <button
                className="task-check"
                aria-label={`Marcar ${item.title}`}
                onClick={() => onToggle(item.id)}
              >
                {checks[item.id] && <CheckCircle2 size={18} />}
              </button>
              <div>
                <div className="plan-tags">
                  <span>{item.month}</span>
                  <span>{item.family}</span>
                  <span>{item.phase}</span>
                </div>
                <strong>{item.title}</strong>
                <small>
                  {item.owner} · {familyCounts[item.family] ?? "—"} fichas
                  disponibles en esta familia
                </small>
              </div>
            </article>
          ))}
        </div>
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

function QuickReplies() {
  const [channel, setChannel] = useState("general");
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
          <div className="segmented">
            <button
              className={channel === "general" ? "selected" : ""}
              onClick={() => setChannel("general")}
            >
              General
            </button>
            <button
              className={channel === "penosil" ? "selected" : ""}
              onClick={() => setChannel("penosil")}
            >
              Penosil
            </button>
          </div>
        </div>
        <div className="reply-grid">
          {QUICK_REPLIES[channel].map(([title, guidance], index) => (
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

function DataSettings({ data, setData, session, syncStatus }) {
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [exportFamily, setExportFamily] = useState("Todas");
  const [pendingClientImport, setPendingClientImport] = useState(null);

  async function pairBrowser(channel) {
    if (!session?.access_token) {
      setMessage("Volvé a ingresar al CRM para vincular esta computadora.");
      return;
    }
    setConnecting(true);
    setMessage(
      `Vinculando esta computadora a ${channel === "general" ? "WhatsApp General" : "WhatsApp Penosil"}…`,
    );
    try {
      const response = await fetch("/api/bridge-pair", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "No se pudo preparar la vinculación.");
      const paired = new Promise((resolve) => {
        const listener = (event) => {
          if (
            event.source === window &&
            event.data?.type === "POLIPLAST_BRIDGE_PAIRED" &&
            event.data.channel === channel
          ) {
            window.removeEventListener("message", listener);
            resolve(true);
          }
        };
        window.addEventListener("message", listener);
        setTimeout(() => {
          window.removeEventListener("message", listener);
          resolve(false);
        }, 3500);
      });
      window.postMessage(
        {
          type: "POLIPLAST_BRIDGE_CONFIG",
          channel: payload.channel,
          endpoint: payload.endpoint,
          token: payload.token,
        },
        window.location.origin,
      );
      if (await paired) {
        setMessage(
          `Listo. Esta computadora quedó vinculada a ${channel === "general" ? "WhatsApp General" : "WhatsApp Penosil"}. La memoria se actualiza al usar WhatsApp Web; no tenés que activarla cada día.`,
        );
      } else {
        setMessage(
          "No encontré el conector en este navegador. Instalalo una sola vez, recargá el CRM y volvé a vincular.",
        );
      }
    } catch (error) {
      setMessage(error.message || "No se pudo vincular esta computadora.");
    } finally {
      setConnecting(false);
    }
  }

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
    setMessage("Activando la recepción oficial de ambos canales…");
    try {
      const results = await Promise.all(
        ["general", "penosil"].map(async (channel) => {
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
      setMessage(
        `Recepción técnica activada para ${results.join(" y ")}. Falta confirmar que cada teléfono esté conectado mediante coexistencia.`,
      );
    } catch (error) {
      setMessage(
        error.message || "No se pudieron activar los canales oficiales.",
      );
    } finally {
      setConnecting(false);
    }
  }

  function importCommercialCohort() {
    const cohort = buildCommercialCohort();
    const result = mergeCommercialCohort(data);
    setData(result.state);
    setMessage(
      `Cohorte comercial verificada: ${result.addedClients} clientes y ${result.addedTasks} tareas nuevas. ${cohort.clients.length - result.addedClients} cuentas existentes fueron preservadas sin cambios.`,
    );
  }

  async function importCommercialMaster() {
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
      const result = mergeClientsCsv(data.clients, await file.text());
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
            <span className="eyebrow">Memoria automática</span>
            <h2>Vincular esta computadora</h2>
          </div>
          <Link2 size={22} />
        </div>
        <p>
          Instalá el conector una sola vez y elegí qué WhatsApp Business está
          abierto en este perfil. Después funciona solo al usar WhatsApp Web: el
          CRM agrupa la conversación por persona o empresa y nunca responde por
          vos.
        </p>
        <div className="modal-actions">
          <button
            className="primary"
            disabled={connecting}
            onClick={() => pairBrowser("general")}
          >
            {connecting ? "Vinculando…" : "Vincular a WhatsApp General"}
          </button>
        </div>
        {message && <div className="system-message">{message}</div>}
        <details>
          <summary>Configuración avanzada de Meta</summary>
          <p>
            El canal General también recibe eventos por la integración oficial.
            Usá estas opciones solo para mantenimiento técnico.
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={connecting}
              onClick={activateOfficialChannels}
            >
              Activar recepción oficial
            </button>
            <button
              className="secondary"
              disabled={connecting}
              onClick={startWhatsAppConnection}
            >
              Conectar otro número con Meta
            </button>
          </div>
        </details>
      </section>
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
          y se incorpora como fichas editables, sin crear tareas masivas.
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

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    setMessage("Enviando acceso…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
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
          Ingresá con el correo habilitado. No necesitás recordar una
          contraseña.
        </p>
        <form onSubmit={submit}>
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
        {message && <div className="system-message">{message}</div>}
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

function InteractionForm({ form, setForm, editing = false, onClose, onSave }) {
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
              {Object.entries(CHANNELS).map(([key, item]) => (
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
          <label>
            Temperatura comercial
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
