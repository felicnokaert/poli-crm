import { MessageCircle } from "lucide-react";

export function Goal({ title, text }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function Empty({ text }) {
  return (
    <div className="empty">
      <MessageCircle size={24} />
      <p>{text}</p>
    </div>
  );
}

// Spinner + Loading reutilizables: hasta ahora casi ningún punto de la app
// mostraba algo mientras esperaba una respuesta de Supabase, así que se
// percibía como colgada. Un solo componente CSS (sin librerías) para no
// terminar con 3 variantes de "cargando" distintas por archivo.
export function Spinner({ size = 18 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function Loading({ text = "Cargando…" }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <Spinner size={24} />
      <p>{text}</p>
    </div>
  );
}

export function Fact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "A confirmar"}</strong>
    </div>
  );
}

// El isologo de Grupo Poliplast ya está dibujado como un anillo partido en
// dos tonos (ver poliplast-isotipo-negro.png) - hacerlo girar entero alcanza
// para leerse como "cargando" sin necesitar un spinner aparte superpuesto.
export function Splash({ text }) {
  return (
    <div className="login-shell" role="status" aria-live="polite">
      <section className="login-card splash-card">
        <img className="splash-mark" src="/poliplast-isotipo-negro.png" alt="Grupo Poliplast" />
        <p>{text}</p>
      </section>
    </div>
  );
}
