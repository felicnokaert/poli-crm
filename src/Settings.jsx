import { useMemo, useState } from "react";
import { Database, UserCog } from "lucide-react";
import { onlineConfigured, saveOnlineState, supabase } from "./online";
import { removeExplicitTestData, testDataCandidates } from "./data-hygiene.mjs";

export function TestCleanupPanel({ data, setData, session }) {
  const [message, setMessage] = useState("");
  const candidates = useMemo(() => testDataCandidates(data), [data]);
  const count = Object.values(candidates).reduce(
    (total, items) => total + items.length,
    0,
  );

  async function clean() {
    if (!count) return;
    const cleaned = removeExplicitTestData(data);
    try {
      if (onlineConfigured && session?.user)
        await saveOnlineState(session.user.id, session.user.email, cleaned);
      setData(cleaned);
      setMessage(
        `Listo: se retiraron ${count} registros inequívocos de prueba. Todo dato real o dudoso fue conservado.`,
      );
    } catch {
      setMessage(
        "No se pudo confirmar la limpieza online. No se aplicó ningún borrado parcial.",
      );
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Higiene de datos</span>
          <h2>Pruebas de desarrollo</h2>
        </div>
        <Database size={22} />
      </div>
      <p>
        La detección es deliberadamente conservadora: solo incluye nombres y
        textos explícitos de prueba.
      </p>
      <div className="modal-actions">
        <button
          className="secondary"
          type="button"
          disabled={!count}
          onClick={clean}
        >
          {count
            ? `Eliminar ${count} registros de prueba`
            : "Sin pruebas pendientes"}
        </button>
      </div>
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}

export function Profile({ data, setData, session }) {
  const [name, setName] = useState(data.profileName || "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function saveName(event) {
    event.preventDefault();
    setData({ ...data, profileName: name.trim() });
    setMessage("Nombre guardado.");
  }

  async function changePassword(event) {
    event.preventDefault();
    if (password.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setMessage("Actualizando contraseña…");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message || "No se pudo actualizar la contraseña.");
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    setMessage("Contraseña actualizada.");
  }

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Tu cuenta</span>
            <h2>Perfil</h2>
          </div>
          <UserCog size={22} />
        </div>
        <form className="form-grid" onSubmit={saveName}>
          <label>
            Nombre y apellido
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej: Felipe Cnokaert"
            />
          </label>
          <label>
            Correo
            <input value={session?.user?.email || ""} disabled />
          </label>
          <div className="modal-actions span-2">
            <button className="primary" type="submit">Guardar nombre</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Seguridad</span>
            <h2>Cambiar contraseña</h2>
          </div>
        </div>
        <form className="form-grid" onSubmit={changePassword}>
          <label>
            Contraseña nueva
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <label>
            Repetir contraseña
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <div className="modal-actions span-2">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </div>
        </form>
        {message && <div className="system-message">{message}</div>}
      </section>
    </div>
  );
}
