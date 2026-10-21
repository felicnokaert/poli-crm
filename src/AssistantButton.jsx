import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AssistantLogo } from "./AssistantLogo.jsx";

// Botón del asistente (21/10): abajo a la derecha en todas las pantallas. Por ahora abre el buscador de
// Academia (fichas, guías, productos, clientes, competencia y preguntas de Mercado Libre), que no usa IA
// ni cuesta nada. Cuando David apruebe el presupuesto, este mismo panel pasa a ser el chat del asistente.
const KnowledgeSearch = lazy(() => import("./Academy").then((m) => ({ default: m.KnowledgeSearch })));

export function AssistantButton({ supabase, clients = [] }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => panelRef.current?.querySelector("input")?.focus(), 60);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [open]);

  return (
    <>
      {!open && (
        <button type="button" className="assistant-fab" aria-label="Abrir el asistente" title="Asistente: preguntá lo que necesites" onClick={() => setOpen(true)}>
          <AssistantLogo size={40} />
        </button>
      )}
      {open && (
        <aside className="assistant-drawer" role="dialog" aria-label="Asistente" ref={panelRef}>
          <header className="assistant-drawer-head">
            <AssistantLogo size={30} />
            <div>
              <strong>Asistente</strong>
              <span className="muted small">Busca en todo lo que sabe el CRM</span>
            </div>
            <button type="button" className="icon-button" aria-label="Cerrar el asistente" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="assistant-drawer-body">
            <Suspense fallback={<p className="muted">Cargando…</p>}>
              <KnowledgeSearch supabase={supabase} clients={clients} />
            </Suspense>
          </div>
        </aside>
      )}
    </>
  );
}
