import { useCallback } from "react";
import { isIgnoredWhatsAppContact, whatsappContactIdentity } from "../whatsapp-threads.mjs";
import { classifyClientContactByWhatsApp, findClientByWhatsApp } from "../client-contacts.mjs";
import { whatsappThreadKey } from "../whatsapp-draft.mjs";

// Acciones en tanda de la bandeja (clasificar, archivar, excluir y borrar varios) y el borrado de la
// bandeja vieja. Salieron de useInboxActions.js (QA 16/10: 631 líneas), sin cambios.
export function useInboxBatchActions({ data, setData, confirm, session }) {
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

  return { batchClassifyInbox, batchArchiveInbox, batchExcludeInbox, batchDeleteInbox, deleteLegacyInbox, deleteAllLegacyInbox };
}
