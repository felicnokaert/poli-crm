import { inferIntent } from "./commercial-intelligence.mjs";
import { whatsappContactKey } from "./whatsapp-threads.mjs";
import { suggestTriage } from "./commercial-triage.mjs";

// Borrador de "Revisar conversación" a partir de un mensaje de WhatsApp (familia, urgencia, intención)
// y la clave del hilo. Salieron de useInboxActions.js (QA 16/10), sin cambios.
export function draftFromWhatsApp(event) {
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

export function whatsappThreadKey(event) {
  return whatsappContactKey(event);
}
