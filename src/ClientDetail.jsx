import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatDate } from "./utils.mjs";
import { Empty, Fact } from "./ui-primitives";
import { InteractionRow } from "./Interactions";
import { TaskList } from "./Tasks";
import {
  clientContacts,
  removeClientContact,
  setPrimaryClientContact,
  updateClientContact,
  withClientContact,
} from "./client-contacts.mjs";
import { canonicalFamily, FAMILIES } from "./families.mjs";
import { lastPurchaseForClient } from "./client-purchase-history.mjs";
import { buildCommercialGuidance } from "./commercial-guidance.mjs";
import { PIPELINE, commercialOutcome, commercialStage, useModalEscape } from "./app-shared";

export function ClientDetail({
  client,
  interactions,
  tasks,
  sales,
  onClose,
  onOpenInteraction,
  onNewInteraction,
  onNewTask,
  onOpenTask,
  onToggleTask,
  onSave,
  onDelete,
}) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client || {});
  const [newContact, setNewContact] = useState({ name: "", role: "", phone: "", email: "" });
  useEffect(() => {
    // Algunas fichas importadas tienen `family` en mayúsculas o con una
    // variante distinta a FAMILIES (ej. "CARROZADOS", "POLIURETANOS") - sin
    // esto, el <select> de abajo no encontraba ninguna opción para
    // seleccionar y guardar sin tocar este campo podía pisarlo con el
    // primer valor de la lista sin que nadie lo notara.
    setDraft(client ? { ...client, family: canonicalFamily(client.family) } : {});
  }, [client?.id]);
  if (!client) return null;
  const latest = interactions[0];
  const detectedPurchase = lastPurchaseForClient(client, sales || []);
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
      stage: commercialStage(draft.stage),
      outcome: commercialOutcome(draft),
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
                <select value={commercialStage(draft.stage)} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
                  {PIPELINE.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Resultado
                <select value={commercialOutcome(draft)} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}>
                  <option>Abierto</option>
                  <option>Ganado</option>
                  <option>Perdido</option>
                  <option>Pausado</option>
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
                Última compra (manual, no se toca sola)
                <input {...field("lastPurchase")} placeholder="Ej: en efectivo en el local, sin factura" />
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
              {["Pausado", "Perdido"].includes(commercialOutcome(draft)) && (
                <label className="span-2">
                  Motivo de {commercialOutcome(draft).toLowerCase()}
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
              <Fact label="Última compra (manual)" value={client.lastPurchase} />
              <Fact
                label="Última compra según facturas"
                value={
                  detectedPurchase
                    ? `${formatDate(detectedPurchase.date)} · ${detectedPurchase.products.join(", ") || "sin producto legible"}${detectedPurchase.unit ? ` · ${detectedPurchase.unit}` : ""}`
                    : "Sin facturas a nombre exacto de este cliente (revisá Ventas si cargaste alguna con otro nombre)"
                }
              />
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
              {onDelete && (
                <button
                  className="danger-link"
                  type="button"
                  onClick={async () => {
                    if (await onDelete(client.id)) onClose();
                  }}
                >
                  Eliminar cliente
                </button>
              )}
            </div>
            {onOpenTask && (
              <div className="history">
                <h3>Tareas de esta empresa</h3>
                <TaskList
                  items={tasks}
                  onToggle={onToggleTask}
                  onOpen={(id) => {
                    onClose();
                    onOpenTask(id);
                  }}
                  emptyText="Sin tareas registradas para esta empresa."
                />
              </div>
            )}
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
