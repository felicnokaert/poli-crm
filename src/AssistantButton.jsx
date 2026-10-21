import { Suspense, lazy, useCallback, useState } from "react";
import { AssistantLogo } from "./AssistantLogo.jsx";

// Botón del asistente (21/10): abajo a la derecha en todas las pantallas. Abre la ventana flotante del
// asistente (src/AssistantWindow.jsx), que se baja recién la primera vez que alguien la abre.
const AssistantWindow = lazy(() => import("./AssistantWindow.jsx").then((m) => ({ default: m.AssistantWindow })));

export function AssistantButton({ supabase, clients = [], firstName = "", isAdmin = false }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {!open && (
        <button type="button" className="assistant-fab" aria-label="Abrir el asistente" title="Asistente: preguntá lo que necesites" onClick={() => setOpen(true)}>
          <AssistantLogo size={40} />
        </button>
      )}
      {open && (
        <Suspense fallback={<div className="assistant-window assistant-loading" role="status"><AssistantLogo size={40} /></div>}>
          <AssistantWindow supabase={supabase} clients={clients} firstName={firstName} isAdmin={isAdmin} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
