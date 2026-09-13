import { X } from "lucide-react";
import { useModalEscape } from "./app-shared";

// Los atajos ("/" y "n") solo se anunciaban con un title (tooltip al pasar
// el mouse), poco visible. Este panel los lista de forma explícita desde el
// ícono de ayuda de la topbar.
//
// Extraído de App.jsx a su propio módulo para poder testearlo en aislamiento
// (montar App() completo en un test es costoso: depende de sesión/Supabase y
// de muchas otras props) y porque, al no depender de nada de App() más allá
// de onClose, no había motivo para que viviera anidado ahí.
export function ShortcutsHelp({ onClose }) {
  useModalEscape(onClose);
  const shortcuts = [
    ["/", "Buscar en la pantalla actual"],
    ["n", "Nueva tarea"],
    ["Esc", "Cerrar el formulario o ficha abierta"],
  ];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal shortcuts-help"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">Ayuda</span>
            <h2>Atajos de teclado</h2>
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
        <dl className="shortcuts-list">
          {shortcuts.map(([key, description]) => (
            <div key={key}>
              <kbd>{key}</kbd>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
