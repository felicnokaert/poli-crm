import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { MODULES, accessChange, deniedSet, moduleKey } from "./module-access.mjs";
import { isChannelAdmin } from "./user-channels.mjs";

// Qué módulos y submódulos ve cada persona (solo administrador). Tildado = lo ve. Por defecto todos ven todo.
export function ModuleAccessPanel({ supabase }) {
  const [users, setUsers] = useState(null);
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const [list, access] = await Promise.all([supabase.rpc("admin_list_users"), supabase.from("module_access").select("email, module, allowed")]);
    if (list.error) { setMessage("No se pudo cargar la lista de usuarios."); setUsers([]); return; }
    if (access.error) setMessage("Falta crear la tabla de permisos (module_access): pedile a Claude que la aplique.");
    const people = (list.data || []).filter((user) => !isChannelAdmin(user.email));
    setUsers(people);
    setRows(access.data || []);
    setEmail((current) => current || String(people[0]?.email || "").toLowerCase());
  }
  useEffect(() => { load(); }, []);

  const denied = useMemo(() => deniedSet(rows.filter((row) => String(row.email).toLowerCase() === email)), [rows, email]);

  async function toggle(key, allowed) {
    const change = accessChange(email, key, allowed);
    setBusy(key); setMessage("");
    const result = change.op === "delete"
      ? await supabase.from("module_access").delete().eq("email", change.email).eq("module", change.module)
      : await supabase.from("module_access").upsert(change.row, { onConflict: "email,module" });
    setBusy("");
    if (result.error) { setMessage("No se pudo guardar el cambio."); return; }
    setRows((current) => {
      const rest = current.filter((row) => !(String(row.email).toLowerCase() === change.email && row.module === key));
      return allowed ? rest : [...rest, { email: change.email, module: key, allowed: false }];
    });
  }

  const box = (key, label, parentDenied = false) => (
    <label key={key} className="check-row">
      <input type="checkbox" checked={!denied.has(key) && !parentDenied} disabled={busy === key || parentDenied} onChange={(event) => toggle(key, event.target.checked)} />
      {label}
    </label>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><ShieldCheck size={18} /> Qué ve cada persona</h2>
          <p>Elegí una persona y destildá lo que no tiene que ver. Perfil y Datos siempre se ven. Esto oculta pantallas y pestañas; los datos delicados además los protege la base (por ejemplo, las claves y la facturación).</p>
        </div>
      </div>
      {message && <div className="system-message">{message}</div>}
      {users === null && <p className="muted">Cargando…</p>}
      {users && users.length === 0 && <p className="muted">No hay otros usuarios registrados.</p>}
      {users && users.length > 0 && (
        <>
          <label>Persona
            <select value={email} onChange={(event) => setEmail(event.target.value)}>
              {users.map((user) => <option key={user.id} value={String(user.email).toLowerCase()}>{user.name ? `${user.name} · ` : ""}{user.email}</option>)}
            </select>
          </label>
          <div className="module-access-grid">
            {MODULES.map((module) => (
              <div key={module.id} className="module-access-item">
                {box(module.id, module.label)}
                {module.children && (
                  <div className="module-access-children">
                    {module.children.map(([child, label]) => box(moduleKey(module.id, child), label, denied.has(module.id)))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
