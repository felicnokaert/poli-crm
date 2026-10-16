import { useEffect } from "react";
import { COMMERCIAL_STAGES } from "./commercial-knowledge.mjs";

// Tablero maestro de Trello (ver ProjectBoardGateway en Dashboard.jsx): unica
// fuente de proyectos/prioridades del equipo, compartida acá tambien para el
// link "Ver en Trello" de las tareas de automatizacion en Tasks.jsx.
export const TRELLO_BOARD_URL = "https://trello.com/b/uSYz1qMF/ventas-grupo-poliplast";

export const CHANNELS = {
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

// Suma a CHANNELS los canales definidos en la tabla whatsapp_channels. Los
// historicos (general, penosil, juan) conservan su ficha de siempre; solo se
// agregan los que no existen todavia.
export function registerChannels(rows = []) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.channel_key || CHANNELS[row.channel_key]) continue;
    CHANNELS[row.channel_key] = {
      name: row.label || row.channel_key,
      number: row.display_number || "",
      profile: "",
      color: row.color || "#475569",
      status: "Configurado",
      statusTone: "waiting",
    };
  }
}

export function profileInitials(nameOrEmail = "") {
  const local = String(nameOrEmail).split("@")[0] || "";
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export const LEGACY_STAGE_MAP = {
  Nuevo: "Preparación",
  Contactado: "Apertura",
  Conversación: "Diagnóstico",
  Calificado: "Calificación",
  Propuesta: "Propuesta",
  Negociación: "Negociación",
  Ganado: "Posventa",
  Pausado: "Seguimiento",
  Perdido: "Seguimiento",
};
export const PIPELINE = COMMERCIAL_STAGES.map((stage) => stage.label);

export function commercialStage(stage) {
  return LEGACY_STAGE_MAP[stage] || (PIPELINE.includes(stage) ? stage : "Preparación");
}

export function commercialOutcome(record = {}) {
  if (record.outcome) return record.outcome;
  if (record.stage === "Ganado") return "Ganado";
  if (record.stage === "Perdido") return "Perdido";
  if (record.stage === "Pausado") return "Pausado";
  return "Abierto";
}

export const INTENTS = [
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

export const initialState = {
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

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysToToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function longToday() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function googleCalendarUrl(task) {
  const day = String(task?.dueDate || today());
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: task?.title || "Seguimiento comercial",
    details: [task?.company, task?.trigger].filter(Boolean).join(" · "),
  });
  if (task?.kind === "evento" && task?.startTime) {
    const compact = (time) => `${time.replace(":", "")}00`;
    const startHour = Number(task.startTime.slice(0, 2));
    const fallbackEnd = `${String(Math.min(startHour + 1, 23)).padStart(2, "0")}:${task.startTime.slice(3, 5)}`;
    const stamp = day.replaceAll("-", "");
    parameters.set("dates", `${stamp}T${compact(task.startTime)}/${stamp}T${compact(task.endTime || fallbackEnd)}`);
    parameters.set("ctz", "America/Argentina/Buenos_Aires");
    if (task.place) parameters.set("location", task.place);
    return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
  }
  const start = day.replaceAll("-", "");
  const endDate = new Date(`${day}T12:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll("-", "");
  parameters.set("dates", `${start}/${end}`);
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

export function useModalEscape(onClose) {
  useEffect(() => {
    const handleKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
}

export function blankInteraction() {
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
    stage: "Diagnóstico",
    outcome: "Abierto",
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

export function blankTask() {
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

// Cotizador comercial: aplicación aparte (repo poliplast-cotizador, misma base). Se abre en otra
// pestaña; con ?cliente= llega con la empresa ya elegida. Cotizar nunca registra una venta.
export const COTIZADOR_URL = "https://cotizador-poliplast.vercel.app/";
export function cotizadorUrl(company = "", phone = "") {
  const params = new URLSearchParams();
  if (String(company || "").trim()) params.set("cliente", String(company).trim());
  if (String(phone || "").trim()) params.set("telefono", String(phone).trim());
  const query = params.toString();
  return query ? `${COTIZADOR_URL}?${query}` : COTIZADOR_URL;
}
