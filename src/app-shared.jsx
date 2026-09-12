import { useEffect } from "react";
import { COMMERCIAL_STAGES } from "./commercial-knowledge.mjs";

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

export function longToday() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function googleCalendarUrl(task) {
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
