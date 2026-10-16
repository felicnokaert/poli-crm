import { useState } from "react";
import { Eraser } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";

const LABELS = {
  tasks: "tareas", interactions: "registros del historial", opportunities: "oportunidades", sales: "ventas",
  boardLists: "listas del tablero", boardCards: "tarjetas del tablero", salesGoals: "objetivos de venta",
  businessUnits: "unidades de negocio", prospects: "prospectos", prospectSearches: "búsquedas de prospectos",
  researchJobs: "investigaciones", mergeLogs: "fusiones", duplicateReviewDecisions: "decisiones de duplicados",
  clientPrivateData: "empresas tuyas (quedan como directorio, sin tus notas ni compras y fuera de su pipeline)",
  deletedClients: "empresas que vos ya borraste o fusionaste",
  automaticTasks: "tareas automáticas («Retomar contacto», «Responder a…») creadas por tus empresas o chats",
  inbox: "chats de otros números en Por revisar", ignoredWhatsAppContacts: "contactos marcados como no comerciales",
  dismissedInboxEventIds: "mensajes descartados", planChecks: "marcas de tu rutina",
  profileName: "tu nombre de perfil", weeklyTargets: "tus metas semanales", prospectFocus: "tu foco de prospección",
  prospectSwitches: "tus ajustes de prospección", welcomeDismissed: "aviso de bienvenida",
};

const describe = (removed = {}) => Object.entries(removed).map(([key, count]) => (count === 1 && ["profileName", "weeklyTargets", "prospectFocus", "prospectSwitches", "welcomeDismissed"].includes(key) ? LABELS[key] : `${count} ${LABELS[key] || key}`)).join(" · ");

// Revisa y limpia lo que se copió de tu espacio al de otras cuentas (error ya corregido del 16/10).
export function WorkspaceCleanup({ session }) {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(mode) {
    const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action: "cleanup", mode }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo revisar.");
    return body;
  }

  async function preview() {
    setBusy(true); setMessage("");
    try { setAccounts((await call("preview")).accounts || []); } catch (error) { setMessage(error.message); }
    setBusy(false);
  }

  async function apply() {
    const affected = (accounts || []).filter((item) => item.changed);
    const ok = await confirm(`Se saca de ${affected.length} ${affected.length === 1 ? "cuenta" : "cuentas"} lo que vino de tu espacio. Lo que cada persona cargó por su cuenta no se toca, y las empresas quedan (sin tus notas ni compras). Conviene que después recarguen la página. ¿Seguimos?`, {
      title: "Limpiar espacios",
      confirmLabel: "Limpiar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMessage("");
    try {
      const body = await call("apply");
      const failed = (body.applied || []).filter((item) => !item.ok).map((item) => item.email);
      setMessage(failed.length ? `Listo, salvo ${failed.join(", ")}: se guardó algo mientras tanto. Volvé a revisar y limpiar.` : "Listo: espacios limpios. Pediles que recarguen la página.");
      setAccounts((await call("preview")).accounts || []);
    } catch (error) { setMessage(error.message); }
    setBusy(false);
  }

  const affected = (accounts || []).filter((item) => item.changed);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><Eraser size={18} /> Datos tuyos en otras cuentas</h2>
          <p>Por un error (ya corregido), al entrar con otra cuenta en un navegador donde estabas vos, tu espacio se copiaba al de esa persona: tus chats, tareas, rutina y plan de Trello. Acá ves qué quedó copiado en cada cuenta y lo podés sacar. Primero se muestra, después confirmás.</p>
        </div>
      </div>
      <div className="panel-head-actions">
        <button type="button" className="secondary" disabled={busy} onClick={preview}>Revisar cuentas</button>
        {affected.length > 0 && <button type="button" className="primary" disabled={busy} onClick={apply}>Limpiar {affected.length} {affected.length === 1 ? "cuenta" : "cuentas"}</button>}
      </div>
      {message && <div className="system-message">{message}</div>}
      {accounts && (
        <div className="admin-users">
          {accounts.length === 0 && <p className="muted">No hay otras cuentas con espacio guardado.</p>}
          {accounts.map((item) => (
            <article key={item.email} className="admin-user-row">
              <div>
                <strong>{item.email}</strong>
                <span className="muted small">{item.changed ? `Copiado de tu espacio: ${describe(item.removed)}` : "Limpio: no tiene nada tuyo."}</span>
                {item.automaticTasks > 0 && <span className="muted small">Además tiene {item.automaticTasks} tareas automáticas pendientes, creadas por el CRM con sus propias empresas o su número de WhatsApp (no vienen de tu cuenta; no se borran).</span>}
              </div>
              <span className={`pill ${item.changed ? "warn" : "ok"}`}>{item.changed ? "Para limpiar" : "OK"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
