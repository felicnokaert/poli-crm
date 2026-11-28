import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

// Poliplast App (26/11): campanita con una ventanita. Nada salta solo: el número chico avisa, y al tocar se ve la
// lista. «Para hacer» y «Novedades»; tocar una lleva a la pantalla y la marca leída; «Marcar todo como leído».
export function NotificationBell({ items = [], read = [], onRead, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("action");
  const [showRead, setShowRead] = useState(false);
  const boxRef = useRef(null);
  const seen = new Set(read);
  const unread = items.filter((item) => !seen.has(item.id));
  // Por defecto solo lo NO leído: leído = ya está. «Ver leídas» las muestra igual.
  const shown = items.filter((item) => (tab === "action" ? item.kind === "action" : item.kind !== "action") && (showRead || !seen.has(item.id)));
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const onClick = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);
  const count = (kind) => items.filter((item) => (kind === "action" ? item.kind === "action" : item.kind !== "action") && !seen.has(item.id)).length;
  return (
    <div className="notif" ref={boxRef}>
      <button type="button" className={`icon-button notif-button${unread.length ? " has-unread" : ""}`} aria-label={`Notificaciones${unread.length ? `: ${unread.length} sin leer` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={18} />
        {unread.length > 0 && <span className="notif-count">{unread.length > 99 ? "99+" : unread.length}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <div className="notif-head">
            <strong>Notificaciones</strong>
            <button type="button" className="notif-readall" disabled={!unread.length} onClick={() => onRead(unread.map((item) => item.id))}><CheckCheck size={15} /> Marcar todo como leído</button>
          </div>
          <div className="segmented notif-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "action"} className={tab === "action" ? "selected" : ""} onClick={() => setTab("action")}>Para hacer{count("action") ? ` · ${count("action")}` : ""}</button>
            <button type="button" role="tab" aria-selected={tab === "info"} className={tab === "info" ? "selected" : ""} onClick={() => setTab("info")}>Novedades{count("info") ? ` · ${count("info")}` : ""}</button>
          </div>
          {shown.length === 0 ? <p className="notif-empty">{showRead ? "Nada por acá." : "Estás al día. 👌"}</p> : (
            <ul className="notif-list">
              {shown.slice(0, 40).map((item) => (
                <li key={item.id} className={seen.has(item.id) ? "is-read" : ""}>
                  <button type="button" onClick={() => { onRead([item.id]); setOpen(false); onNavigate(item); }}>
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text"><b>{item.title}</b><small>{item.group}{item.detail ? ` · ${item.detail}` : ""}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="notif-toggle-read" onClick={() => setShowRead((value) => !value)}>{showRead ? "Ocultar las leídas" : "Ver también las leídas"}</button>
        </div>
      )}
    </div>
  );
}
