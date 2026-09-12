import { X } from "lucide-react";
import { CLASSIFICATIONS } from "./knowledge";
import { FAMILIES } from "./families.mjs";
import { CHANNELS, PIPELINE, commercialStage, useModalEscape } from "./app-shared";

export function InteractionForm({ form, setForm, myChannels = [], editing = false, onClose, onSave }) {
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
            <select value={commercialStage(form.stage)} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))}>
              {PIPELINE.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Resultado
            <select {...field("outcome")}>
              <option>Abierto</option>
              <option>Ganado</option>
              <option>Perdido</option>
              <option>Pausado</option>
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
          {["Pausado", "Perdido"].includes(form.outcome) && (
            <label className="span-2">
              Motivo de {form.outcome.toLowerCase()}
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
