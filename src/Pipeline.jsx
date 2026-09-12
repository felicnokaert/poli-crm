import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { PIPELINE, commercialStage } from "./app-shared";

export function Pipeline({ clients, onOpenClient, onChangeStage, onDelete, onAdd }) {
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
          const list = clients.filter((client) => commercialStage(client.stage) === stage);
          return (
            <section
              className="kanban-column"
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
