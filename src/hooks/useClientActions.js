import { useCallback } from "react";
import { mergeClients, recordDeletions, recordDuplicateReviewDecision, undoClientMerge } from "../online";
import { clientContacts } from "../client-contacts.mjs";
import { whatsappContactIdentity } from "../whatsapp-threads.mjs";
import { docDe } from "../map-clients-adapter.mjs";
import { conTipoManual } from "../client-type.mjs";
import { aplicarUbicaciones } from "../client-location.mjs";

// Acciones sobre empresas (borrar, fusionar, deshacer fusión, duplicados, editar, tipo y ubicación desde
// el mapa) y los borrados de conversaciones y tareas. Salieron de App.jsx (QA 16/10), sin cambios.
const CLIENT_MERGE_FIELDS = ["company", "legalName", "cuit", "temperature", "family", "stage", "sourceType", "clientType", "industry"];

export function useClientActions({ data, setData, confirm, session }) {
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

  return { deleteClient, mergeClient, undoMerge, markNotDuplicate, postponeDuplicate, deleteInteraction, deleteTask, updateClient, setClientType, applyClientLocations };
}
