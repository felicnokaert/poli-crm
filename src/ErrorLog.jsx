import { useState } from "react";
import { Bug } from "lucide-react";

const when = (iso) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Errores que tuvieron las personas del equipo en los últimos 7 días (solo Felipe).
export function ErrorLog({ session }) {
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState("");
  async function load() {
    setMessage("");
    try {
      const response = await fetch("/api/admin-users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action: "listErrors" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron leer los errores.");
      setErrors(body.errors || []);
    } catch (error) {
      setMessage(error.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Solo para Felipe</span>
          <h2><Bug size={18} /> Errores de la app (últimos 7 días)</h2>
          <p>Cuando a alguien le falla una pantalla, queda registrado acá: quién, cuándo, en qué sección y qué dijo. Así no dependemos de que alguien lo cuente.</p>
        </div>
      </div>
      <div className="panel-head-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="secondary" onClick={load}>{errors ? "Actualizar" : "Ver errores"}</button>
      </div>
      {message && <div className="system-message error">{message}</div>}
      {errors && errors.length === 0 && <p className="muted">Sin errores en los últimos 7 días.</p>}
      {errors && errors.length > 0 && (
        <div className="admin-users">
          {errors.map((item, index) => (
            <article key={`${item.at}-${index}`} className="admin-user-row">
              <div>
                <strong>{item.message}</strong>
                <span className="muted small">{when(item.at)} · {item.email || "sin usuario"}{item.view ? ` · ${item.view}` : ""}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
