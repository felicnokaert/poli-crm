import { useMemo, useState } from "react";
import { Database, UserCog } from "lucide-react";
import { onlineConfigured, saveOnlineState, supabase } from "./online";
import { removeExplicitTestData, testDataCandidates } from "./data-hygiene.mjs";
import { MIN_PASSWORD, authErrorEs, passwordProblem } from "./password-policy.mjs";

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
    <section className="panel" style={{ marginBottom: 14 }}>
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
    const problem = passwordProblem(password, passwordConfirm);
    if (problem) {
      setMessage(problem);
      return;
    }
    setSaving(true);
    setMessage("Actualizando contraseña…");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(authErrorEs(error));
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
              minLength={MIN_PASSWORD}
            />
          </label>
          <label>
            Repetir contraseña
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="••••••••"
              minLength={MIN_PASSWORD}
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
