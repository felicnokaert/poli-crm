import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

// window.confirm() bloquea el hilo del navegador entero - incluso scripts de
// automatización/testing que disparan clicks no pueden "contestarlo". Este
// modal reemplaza esos 13 call-sites con un diálogo propio, no bloqueante,
// que devuelve una Promise<boolean> igual que window.confirm devolvía un bool.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ message, ...options });
    });
  }, []);

  const settle = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmDialog
          message={request.message}
          title={request.title}
          confirmLabel={request.confirmLabel}
          cancelLabel={request.cancelLabel}
          danger={request.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return confirm;
}

function ConfirmDialog({ message, title, confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm-dialog" onClick={(event) => event.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="modal-head">
          <div>
            {danger && <AlertTriangle size={18} className="confirm-dialog-icon" />}
            <h2>{title || (danger ? "¿Confirmás esta acción?" : "Confirmar")}</h2>
            <p>{message}</p>
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? "danger-link" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
