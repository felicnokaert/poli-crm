import { useState } from "react";
import { ROLES } from "./poliplast-app-plan.mjs";
import { accessAllows, changesCount, moduleTree, newPerson, setRole, toggleAccess } from "./team-access.mjs";

// Poliplast App (prueba, 25/11): Equipo y cuentas. Felipe (administrador) crea cuentas con mail y rol, y a cada
// persona le suma o le saca módulos y submódulos. En la prueba se guarda en este navegador.
export function TeamAccess({ team, onChange, groups, onViewAs }) {
  const [open, setOpen] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "comercial" });
  const [message, setMessage] = useState("");
  const tree = moduleTree(groups);
  const update = (email, change) => onChange(team.map((person) => (person.email === email ? change(person) : person)));
  const add = (event) => {
    event.preventDefault();
    const result = newPerson(form);
    if (result.error) return setMessage(result.error);
    if (team.some((person) => person.email === result.person.email)) return setMessage("Esa persona ya está en la lista.");
    onChange([...team, result.person]);
    setForm({ email: "", name: "", role: "comercial" });
    setMessage(`Listo: ${result.person.email} queda como ${ROLES.find((role) => role.id === result.person.role)?.label}. Cuando se registre con ese mail, entra viendo eso.`);
  };
  return (
    <section className="panel team-access">
      <span className="eyebrow">Solo administradores</span>
      <h2>Equipo y cuentas</h2>
      <p className="muted small">Cada persona tiene un rol (lo que ve por defecto) y encima le podés sumar o sacar módulos y submódulos. Solo pueden entrar mails @grupopoliplast.com.ar. «Ver como» te muestra el menú como lo ve esa persona.</p>
      <form className="team-access-add" onSubmit={add}>
        <label>Mail<input type="email" value={form.email} placeholder="nombre@grupopoliplast.com.ar" onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Rol<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
        <button type="submit" className="primary">Crear cuenta</button>
      </form>
      {message && <p className="demo-msg" role="status">{message}</p>}
      <ul className="team-access-list">
        {team.map((person) => {
          const changes = changesCount(person);
          const isOpen = open === person.email;
          return (
            <li key={person.email}>
              <div className="team-access-row">
                <div>
                  <strong>{person.name}</strong> <span className="muted small">{person.email}</span>
                  <div className="muted small">{person.registered ? "Registrada" : "Todavía no se registró"}{changes ? ` · ${changes} cambio${changes === 1 ? "" : "s"} a mano` : ""}</div>
                </div>
                <div className="team-access-actions">
                  <select aria-label={`Rol de ${person.name}`} value={person.role} disabled={person.email === "felipe@grupopoliplast.com.ar"} onChange={(event) => update(person.email, (current) => setRole(current, event.target.value))}>
                    {ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                  </select>
                  {person.role !== "admin" && <button type="button" className="secondary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : person.email)}>{isOpen ? "Cerrar" : "Qué ve"}</button>}
                  {onViewAs && <button type="button" className="secondary" onClick={() => onViewAs(person)}>Ver como</button>}
                </div>
              </div>
              {isOpen && (
                <div className="team-access-modules">
                  {tree.map(([group, items]) => (
                    <fieldset key={group}>
                      <legend>{group}</legend>
                      {items.map((item) => {
                        const on = accessAllows(person, item.id);
                        return (
                          <div key={item.id} className="team-access-module">
                            <label><input type="checkbox" checked={on} onChange={() => update(person.email, (current) => toggleAccess(current, item.id))} /> {item.label}</label>
                            {on && item.children.length > 0 && (
                              <div className="team-access-children">
                                {item.children.map((child) => (
                                  <label key={child}><input type="checkbox" checked={accessAllows(person, item.id, child)} onChange={() => update(person.email, (current) => toggleAccess(current, item.id, child))} /> {child}</label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </fieldset>
                  ))}
                  {changes > 0 && <button type="button" className="secondary" onClick={() => update(person.email, (current) => setRole(current, current.role))}>Volver a lo del rol</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
