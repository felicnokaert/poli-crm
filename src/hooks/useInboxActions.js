import { useCallback } from "react";
import { today } from "../app-shared";
import { inferIntent } from "../commercial-intelligence.mjs";
import { isIgnoredWhatsAppContact, whatsappContactIdentity } from "../whatsapp-threads.mjs";
import { addInteractionOnce } from "../conversation-history.mjs";
import { attachWhatsAppContact, classifyClientContactByWhatsApp, findClientByWhatsApp } from "../client-contacts.mjs";
import { scoreTriage } from "../commercial-triage.mjs";
import { shouldCreateFollowup } from "../followup-policy.mjs";
import { draftFromWhatsApp, whatsappThreadKey } from "../whatsapp-draft.mjs";
import { useInboxBatchActions } from "./useInboxBatchActions";

// Acciones de la bandeja de WhatsApp ("Por revisar"): clasificar, archivar, excluir, borrar y el
// borrador "Revisar conversación". Salieron de App.jsx (QA 16/10: el archivo tenía 2.077 líneas);
// la lógica es la misma, solo cambió de lugar.
export function useInboxActions({ data, setData, confirm, session, inboxDraft, setInboxDraft, setSelectedClientId }) {
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

  const { batchClassifyInbox, batchArchiveInbox, batchExcludeInbox, batchDeleteInbox, deleteLegacyInbox, deleteAllLegacyInbox } = useInboxBatchActions({ data, setData, confirm, session });

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

  return { classifyInbox, archiveInbox, excludeInboxContact, restoreCommercialContact, restoreInbox, deleteInbox, batchClassifyInbox, batchArchiveInbox, batchExcludeInbox, batchDeleteInbox, deleteLegacyInbox, deleteAllLegacyInbox, openInboxDraft, openInboxContact, confirmInboxDraft };
}
