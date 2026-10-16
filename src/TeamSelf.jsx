import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";

const FIELDS = [
  ["role_text", "¿Qué hacés? (tu rol)", "Ej.: atiendo las consultas de las tiendas online y cotizo."],
  ["receives", "¿Qué consultas te llegan?", "Qué preguntan, de qué marcas, por qué canal."],
  ["leaks", "¿Dónde sentís que se te escapan ventas?", "Seguimiento, cotizaciones sin respuesta, falta de tiempo…"],
  ["habits", "¿Cómo es tu día? ¿Qué hábitos tenés?", "Lo que hacés cada mañana, cada tarde, cada semana."],
  ["needs", "¿Qué necesitás del CRM?", "Lo que te ahorraría tiempo o te ayudaría a vender más."],
];
const EMPTY = { name: "", role_text: "", receives: "", leaks: "", habits: "", needs: "" };

// Cada persona se describe a sí misma. Solo ella y Felipe leen lo que escribe; nadie más.
export function TeamSelf({ supabase, userEmail, isAdmin }) {
  const email = String(userEmail || "").trim().toLowerCase();
  const [form, setForm] = useState(EMPTY);
  const [others, setOthers] = useState([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !email) return;
    supabase.from("team_self_profiles").select("*").order("updated_at", { ascending: false }).then(({ data, error }) => {
      if (error) return;
      const rows = data || [];
      const mine = rows.find((row) => row.email === email);
      if (mine) setForm({ ...EMPTY, ...mine });
      if (isAdmin) setOthers(rows.filter((row) => row.email !== email));
    });
  }, [supabase, email, isAdmin]);

  async function save(event) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true); setMessage("");
    const row = { email, name: form.name.trim(), role_text: form.role_text.trim(), receives: form.receives.trim(), leaks: form.leaks.trim(), habits: form.habits.trim(), needs: form.needs.trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("team_self_profiles").upsert(row);
    setMessage(error ? "No se pudo guardar. Probá de nuevo." : "Guardado. Gracias: esto ayuda a que el CRM te asista a tu medida.");
    setSaving(false);
  }

  if (!supabase) return <p className="muted">Esta sección está disponible en la versión en línea.</p>;
  return (
    <section className="panel commercial-knowledge">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Contanos cómo trabajás</span>
          <h2><UserCheck size={18} /> Tu descripción</h2>
          <p>Describite con tus palabras. Solo vos y Felipe lo leen. Con esto, el CRM va a aprender cómo trabaja cada comercial y cómo asistirlo mejor.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={save}>
        <label className="span-2">Tu nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        {FIELDS.map(([key, label, hint]) => (
          <label className="span-2" key={key}>{label}
            <textarea rows={3} value={form[key] || ""} placeholder={hint} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </label>
        ))}
        <div className="panel-head-actions span-2">
          <button type="submit" className="primary" disabled={saving}>Guardar mi descripción</button>
        </div>
      </form>
      {message && <div className="system-message">{message}</div>}
      {isAdmin && (
        <>
          <h3>Lo que escribió el resto del equipo ({others.length})</h3>
          {others.length === 0 && <p className="muted">Todavía nadie completó su descripción.</p>}
          <div className="knowledge-grid profiles">
            {others.map((row) => (
              <article key={row.email}>
                <span>{row.email}</span>
                <h3>{row.name || row.email}</h3>
                {FIELDS.map(([key, label]) => row[key] ? <p key={key}><strong>{label.replace(/^¿|\?$/g, "")}:</strong> {row[key]}</p> : null)}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
