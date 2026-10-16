import { useEffect, useState } from "react";
import { UserX, Users } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

// Lista de usuarios registrados (mail y nombre) para el administrador, con opción de borrar.
export function AdminUsers({ supabase, session, adminEmails = [] }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) { setMessage("No se pudo cargar la lista de usuarios."); setUsers([]); return; }
    setUsers(data || []);
  }
  useEffect(() => { load(); }, []);

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

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><Users size={18} /> Usuarios registrados {users ? `(${users.length})` : ""}</h2>
          <p>Quién se registró en el CRM, con su mail y su nombre. Desde acá podés borrar un usuario.</p>
        </div>
      </div>
      {message && <div className="system-message">{message}</div>}
      {users === null && <p className="muted">Cargando…</p>}
      {users && users.length === 0 && !message && <p className="muted">No hay usuarios para mostrar.</p>}
      {users && users.length > 0 && (
        <div className="admin-users">
          {users.map((user) => (
            <article key={user.id} className="admin-user-row">
              <div>
                <strong>{user.name || "(sin nombre cargado)"}</strong>
                <span className="muted small">{user.email}</span>
                <span className="muted small">Se registró el {fmt(user.created_at)} · último ingreso {fmt(user.last_sign_in_at)}{user.confirmed ? "" : " · mail sin confirmar"}</span>
              </div>
              {adminEmails.includes(String(user.email || "").toLowerCase())
                ? <span className="pill ok">Administrador</span>
                : <button type="button" className="secondary" disabled={busyId === user.id} onClick={() => remove(user)}><UserX size={14} /> Borrar</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
