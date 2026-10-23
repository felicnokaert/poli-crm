import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, UserX, Users } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { MODULES, accessChange, deniedSet, moduleKey } from "./module-access.mjs";

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const DAY = 86400000;

// Equipo y cuentas (24/10): quién se registró, cuándo entró por última vez y qué ve cada persona. Un solo panel:
// cada fila tiene "Qué ve" (módulos y submódulos, por defecto todo) y "Borrar". Solo para administradores.
export function AdminUsers({ supabase, session, adminEmails = [] }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) { setMessage("No se pudo cargar la lista de usuarios."); setUsers([]); return; }
    setUsers(data || []);
    if (supabase.from) {
      const access = await supabase.from("module_access").select("email, module, allowed");
      if (access.error) setMessage("Falta crear la tabla de permisos (module_access): pedile a Claude que la aplique.");
      else setRows(access.data || []);
    }
  }
  useEffect(() => { load(); }, []);

  const isAdmin = (user) => adminEmails.includes(String(user.email || "").toLowerCase());
  const deniedOf = (email) => deniedSet(rows.filter((row) => String(row.email).toLowerCase() === String(email).toLowerCase()));
  const summary = useMemo(() => {
    const list = users || [];
    const now = Date.now();
    return {
      total: list.length,
      unconfirmed: list.filter((user) => !user.confirmed).length,
      idle: list.filter((user) => user.last_sign_in_at && now - Date.parse(user.last_sign_in_at) > 30 * DAY).length,
      never: list.filter((user) => !user.last_sign_in_at).length,
    };
  }, [users]);

  async function remove(user) {
    const ok = await confirm({
      title: "Borrar usuario",
      message: `Se borra el acceso de ${user.email}${user.name ? ` (${user.name})` : ""}. Ya no va a poder entrar. Sus datos guardados no se tocan. ¿Seguro?`,
      confirmLabel: "Borrar usuario",
      danger: true,
    });
    if (!ok) return;
    setBusyId(user.id); setMessage("");
    try {
      const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ userId: user.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo borrar.");
      setMessage(`Se borró a ${user.email}.`);
      await load();
    } catch (error) {
      setMessage(error.message || "No se pudo borrar.");
    }
    setBusyId("");
  }

  // El tilde cambia al instante; si el servidor lo rechaza se vuelve atrás y se avisa.
  function apply(email, key, allowed) {
    setRows((current) => {
      const rest = current.filter((row) => !(String(row.email).toLowerCase() === email && row.module === key));
      return allowed ? rest : [...rest, { email, module: key, allowed: false }];
    });
  }
  async function toggle(user, key, allowed) {
    const email = String(user.email).toLowerCase();
    setMessage("");
    apply(email, key, allowed);
    const change = accessChange(email, key, allowed);
    const result = allowed
      ? await supabase.from("module_access").delete().eq("email", email).eq("module", key)
      : await supabase.from("module_access").upsert(change.row, { onConflict: "email,module" });
    if (result.error) { apply(email, key, !allowed); setMessage("No se pudo guardar el cambio; quedó como estaba."); }
  }
  async function resetAccess(user) {
    const email = String(user.email).toLowerCase();
    const before = rows;
    setRows((current) => current.filter((row) => String(row.email).toLowerCase() !== email));
    const result = await supabase.from("module_access").delete().eq("email", email);
    if (result.error) { setRows(before); setMessage("No se pudo restablecer; quedó como estaba."); }
  }

  const box = (user, key, label, parentDenied = false) => (
    <label key={key} className="check-row">
      <input type="checkbox" checked={!deniedOf(user.email).has(key) && !parentDenied} disabled={parentDenied} onChange={(event) => toggle(user, key, event.target.checked)} />
      {label}
    </label>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><Users size={18} /> Equipo y cuentas {users ? `(${users.length})` : ""}</h2>
          <p>Quién se registró en el CRM y qué ve cada persona. En "Qué ve" destildás lo que no tiene que ver (Perfil y Datos siempre se ven). Esto oculta pantallas y pestañas; los datos delicados además los protege la base.</p>
        </div>
      </div>
      {message && <div className="system-message">{message}</div>}
      {users === null && <p className="muted">Cargando…</p>}
      {users && users.length === 0 && !message && <p className="muted">No hay usuarios para mostrar.</p>}
      {users && users.length > 0 && (
        <p className="muted small">
          {summary.total} cuentas
          {summary.unconfirmed ? ` · ${summary.unconfirmed} por confirmar su mail` : ""}
          {summary.never ? ` · ${summary.never} nunca ingresaron` : ""}
          {summary.idle ? ` · ${summary.idle} sin ingresar hace más de 30 días` : ""}.
        </p>
      )}
      {users && users.length > 0 && (
        <div className="admin-users">
          {users.map((user) => {
            const admin = isAdmin(user);
            const hidden = admin ? 0 : deniedOf(user.email).size;
            const expanded = open === user.id && !admin;
            return (
              <article key={user.id} className="admin-user-card">
                <div className="admin-user-row">
                  <div>
                    <strong>{user.name || "(sin nombre cargado)"}</strong>
                    <span className="muted small">{user.email}</span>
                    <span className="muted small">Se registró el {fmt(user.created_at)} · último ingreso {fmt(user.last_sign_in_at)}{user.confirmed ? "" : " · mail sin confirmar"}</span>
                  </div>
                  {admin ? <span className="pill ok">Administrador</span> : (
                    <div className="admin-user-actions">
                      <button type="button" className="secondary" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : user.id)}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Qué ve{hidden ? ` (${hidden} oculto${hidden === 1 ? "" : "s"})` : " (todo)"}
                      </button>
                      <button type="button" className="secondary" disabled={busyId === user.id} onClick={() => remove(user)}><UserX size={14} /> Borrar</button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="admin-user-access">
                    <div className="module-access-grid">
                      {MODULES.map((module) => (
                        <div key={module.id} className="module-access-item">
                          {box(user, module.id, module.label)}
                          {module.children && (
                            <div className="module-access-children">
                              {module.children.map(([child, label]) => box(user, moduleKey(module.id, child), label, deniedOf(user.email).has(module.id)))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {hidden > 0 && <button type="button" className="ghost" onClick={() => resetAccess(user)}>Restablecer: que vea todo</button>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
